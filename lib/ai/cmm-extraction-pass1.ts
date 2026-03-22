// Pass 1: Index a CMM PDF by classifying each page and identifying sub-assemblies.
// Sends each page individually to Gemini 2.5 Flash — one at a time for maximum
// accuracy (never parallelize AI calls).
//
// Because large PDFs exceed the 300s serverless timeout, Pass 1 is split into
// batches. Each invocation classifies PAGES_PER_BATCH pages sequentially, saves
// progress to extractionMetadata, then the extract route self-calls for the next
// batch. When all pages are classified, finalizePass1 groups them into sections.

import { prisma } from "@/lib/db";
import { parsePdf } from "@/lib/pdf-utils";
import { callGemini } from "./provider";
import { PASS1_CLASSIFICATION_PROMPT } from "./cmm-prompts";

// How many pages to classify per serverless invocation.
// With 5 concurrent Gemini calls at ~7s each, we process ~5 pages every 7s.
// 35 pages = 7 rounds × 7s = ~50s of AI time + PDF overhead ≈ 80s total.
// Well within the 300s serverless limit.
const PAGES_PER_BATCH = 35;

// Light parallelism for Pass 1 only — each page is classified independently
// so concurrent calls don't affect accuracy. Pass 2 stays sequential because
// dual-model consensus benefits from isolated execution.
const PASS1_CONCURRENCY = 5;

// Explicit cross-references extracted from a page
interface ExplicitReferences {
  figureReferences: string[];           // e.g., ["812", "823"]
  pageReferences: string[];             // e.g., ["73-24"]
  checkReferences: string[];            // e.g., ["23"]
  repairReferences: string[];           // e.g., ["6", "25"]
  specialAssemblyReferences: string[];  // e.g., ["823"]
}

// Metadata for data_table pages — helps with multi-page table stitching
interface TableMetadata {
  hasHeaders: boolean;
  estimatedRows: number;
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
}

// The structure Gemini returns for each page
interface PageClassification {
  pageType: "diagram" | "inspection_text" | "parts_list" | "data_table" | "ignore";
  figureNumber: string | null;
  subAssemblyTitle: string | null;
  sheetNumber: number | null;
  totalSheets: number | null;
  partNumbers: string[];
  notes: string | null;
  explicitReferences?: ExplicitReferences;
  tableMetadata?: TableMetadata; // Present when pageType is "data_table"
}

// Stored in extractionMetadata during incremental Pass 1
interface Pass1Progress {
  pagesToProcess: number[];
  classifiedSoFar: { pageIndex: number; result: PageClassification }[];
  nextBatchStart: number; // index into pagesToProcess array
}

// A grouped figure (may span multiple pages/sheets)
interface FigureGroup {
  figureNumber: string;
  title: string;
  pages: { pageIndex: number; sheetNumber: number; classification: PageClassification }[];
  supplementaryPages: number[]; // inspection_text pages linked to this figure
  partNumbers: string[];
}

/**
 * Classify the next batch of pages. Returns:
 * - "continue" if more pages remain (caller should self-call)
 * - "done" if all pages are classified (sections have been created)
 * - 0 if no sections were found (extraction should fail)
 */
export async function runPass1Batch(templateId: string): Promise<"continue" | "done" | 0> {
  const template = await prisma.inspectionTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  // Load or initialize progress
  let progress: Pass1Progress;
  const meta = template.extractionMetadata as Record<string, unknown> | null;

  if (meta?.pass1Progress) {
    // Resume from saved progress
    progress = meta.pass1Progress as Pass1Progress;
  } else {
    // First invocation — download PDF and determine pages
    const pdfResponse = await fetch(template.sourceFileUrl);
    if (!pdfResponse.ok) throw new Error("Failed to download PDF");
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    const pdf = await parsePdf(pdfBytes);

    const pagesToProcess =
      template.inspectionPages.length > 0
        ? template.inspectionPages
        : Array.from({ length: pdf.pageCount }, (_, i) => i);

    progress = {
      pagesToProcess,
      classifiedSoFar: [],
      nextBatchStart: 0,
    };

    console.log(
      `[CMM Pass 1] Starting: ${pagesToProcess.length} pages for template ${templateId}`
    );
  }

  // Determine this batch's pages
  const batchPages = progress.pagesToProcess.slice(
    progress.nextBatchStart,
    progress.nextBatchStart + PAGES_PER_BATCH
  );

  if (batchPages.length === 0) {
    // All pages already classified — finalize
    return finalizePass1(templateId, progress);
  }

  console.log(
    `[CMM Pass 1] Batch: pages ${progress.nextBatchStart + 1}–${progress.nextBatchStart + batchPages.length} of ${progress.pagesToProcess.length}`
  );

  // Download and parse the PDF for this batch
  const pdfResponse = await fetch(template.sourceFileUrl);
  if (!pdfResponse.ok) throw new Error("Failed to download PDF");
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  const pdf = await parsePdf(pdfBytes);

  // Classify pages with light parallelism (PASS1_CONCURRENCY concurrent calls).
  // Each page is classified independently — no shared context between pages —
  // so concurrency doesn't affect accuracy. Pass 2 stays fully sequential.
  async function classifyPage(pageIndex: number): Promise<{ pageIndex: number; result: PageClassification }> {
    try {
      const pageBase64 = await pdf.extractPageAsBase64(pageIndex);

      const responseText = await callGemini({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: `${PASS1_CLASSIFICATION_PROMPT}\n\nThis is page ${pageIndex + 1} of the document.` },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
        timeoutMs: 30000,
      });

      const parsed = JSON.parse(responseText) as PageClassification;

      console.log(
        `[CMM Pass 1] Page ${pageIndex + 1}: ${parsed.pageType}` +
          (parsed.figureNumber ? ` — Fig. ${parsed.figureNumber}` : "") +
          (parsed.subAssemblyTitle ? ` "${parsed.subAssemblyTitle}"` : "")
      );

      return { pageIndex, result: parsed };
    } catch (error) {
      console.error(`[CMM Pass 1] Error classifying page ${pageIndex + 1}:`, error);
      return {
        pageIndex,
        result: {
          pageType: "ignore",
          figureNumber: null,
          subAssemblyTitle: null,
          sheetNumber: null,
          totalSheets: null,
          partNumbers: [],
          notes: `Classification failed: ${error instanceof Error ? error.message : "unknown error"}`,
        },
      };
    }
  }

  // Process in mini-batches of PASS1_CONCURRENCY
  for (let i = 0; i < batchPages.length; i += PASS1_CONCURRENCY) {
    const chunk = batchPages.slice(i, i + PASS1_CONCURRENCY);
    const results = await Promise.all(chunk.map(classifyPage));
    progress.classifiedSoFar.push(...results);
  }

  // Update progress pointer
  progress.nextBatchStart += batchPages.length;

  // Check if all pages are done
  if (progress.nextBatchStart >= progress.pagesToProcess.length) {
    // All pages classified — finalize
    return finalizePass1(templateId, progress);
  }

  // More pages to go — save progress and signal "continue"
  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      extractionMetadata: JSON.parse(JSON.stringify({
        ...(meta || {}),
        pass1Progress: progress,
      })),
    },
  });

  console.log(
    `[CMM Pass 1] Batch saved: ${progress.classifiedSoFar.length}/${progress.pagesToProcess.length} pages classified`
  );

  return "continue";
}

// ── Reference Resolution ──────────────────────────────────────────────

// A resolved link between a page and a section, stored in InspectionSection.pageLinks
interface PageLink {
  pageIndex: number;
  reason:
    | "diagram_page"
    | "explicit_figure_reference"
    | "explicit_page_reference"
    | "check_reference_context"
    | "repair_reference_context"
    | "special_assembly_reference"
    | "proximity";
  confidence: number;
  referenceText?: string; // The raw text that triggered this link
}

/**
 * Resolve which pages belong to which sections using explicit references first,
 * then falling back to proximity for pages without any explicit reference.
 *
 * Returns a map of figureNumber → PageLink[] plus a list of unresolved pages.
 */
function resolvePageReferences(
  classifications: { pageIndex: number; result: PageClassification }[],
  figureGroups: Map<string, FigureGroup>
): { resolved: Map<string, PageLink[]>; unresolved: { pageIndex: number; notes: string }[] } {
  const resolved = new Map<string, PageLink[]>();
  const unresolved: { pageIndex: number; notes: string }[] = [];

  // Initialize resolved map with diagram pages (always linked to their own figure)
  for (const [figNum, group] of figureGroups) {
    const links: PageLink[] = group.pages.map((p) => ({
      pageIndex: p.pageIndex,
      reason: "diagram_page" as const,
      confidence: 1.0,
    }));
    resolved.set(figNum, links);
  }

  // Build a lookup: which figure owns which page index (for resolving page references)
  const pageToFigure = new Map<number, string>();
  for (const [figNum, group] of figureGroups) {
    for (const p of group.pages) {
      pageToFigure.set(p.pageIndex, figNum);
    }
  }

  // Process all pages not already in a figure group (text, parts lists, figure-less diagrams)
  const nonFigurePages = classifications.filter(
    (c) => c.result.pageType !== "ignore" && !pageToFigure.has(c.pageIndex)
  );

  for (const { pageIndex, result } of nonFigurePages) {
    const refs = result.explicitReferences;
    let linkedByExplicitRef = false;

    if (refs) {
      // Priority 1: Explicit figure references (highest confidence)
      for (const figRef of refs.figureReferences) {
        const normalizedRef = figRef.replace(/^0+/, ""); // Strip leading zeros
        if (figureGroups.has(normalizedRef)) {
          addLink(resolved, normalizedRef, {
            pageIndex,
            reason: "explicit_figure_reference",
            confidence: 0.95,
            referenceText: `FIGURE ${figRef}`,
          });
          linkedByExplicitRef = true;
        }
      }

      // Priority 2: Special assembly references
      for (const saRef of refs.specialAssemblyReferences) {
        const normalizedRef = saRef.replace(/^0+/, "");
        if (figureGroups.has(normalizedRef) && !isAlreadyLinked(resolved, normalizedRef, pageIndex)) {
          addLink(resolved, normalizedRef, {
            pageIndex,
            reason: "special_assembly_reference",
            confidence: 0.85,
            referenceText: `SPECIAL ASSEMBLY FIGURE ${saRef}`,
          });
          linkedByExplicitRef = true;
        }
      }

      // Priority 3: Page references — resolve to the figure that owns that page
      for (const pageRef of refs.pageReferences) {
        // Page references might be like "73-24" (chapter-page) — extract the last number
        const pageNum = parsePageReference(pageRef);
        if (pageNum !== null) {
          const owningFigure = pageToFigure.get(pageNum);
          if (owningFigure && !isAlreadyLinked(resolved, owningFigure, pageIndex)) {
            addLink(resolved, owningFigure, {
              pageIndex,
              reason: "explicit_page_reference",
              confidence: 0.9,
              referenceText: `PAGE ${pageRef}`,
            });
            linkedByExplicitRef = true;
          }
        }
      }

      // Check and repair references are stored in raw metadata but don't create
      // section links on their own — they're weaker signals that may be cross-references
      // rather than ownership indicators. They're used during Pass 2 for context.
    }

    // Proximity fallback: only if no explicit reference resolved this page
    if (!linkedByExplicitRef) {
      let closestFigure: string | null = null;
      let closestDistance = Infinity;

      for (const [figNum, group] of figureGroups) {
        for (const page of group.pages) {
          const distance = Math.abs(page.pageIndex - pageIndex);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestFigure = figNum;
          }
        }
      }

      if (closestFigure && closestDistance <= 3) {
        addLink(resolved, closestFigure, {
          pageIndex,
          reason: "proximity",
          confidence: 0.7,
          referenceText: `nearest diagram ${closestDistance} page(s) away`,
        });
      } else {
        // Page has no explicit reference and is too far from any diagram — unresolved
        unresolved.push({
          pageIndex,
          notes: `No explicit reference found; nearest diagram is ${closestDistance} page(s) away (threshold: 3)`,
        });
      }
    }
  }

  return { resolved, unresolved };
}

/** Add a link to the resolved map, avoiding exact duplicates */
function addLink(resolved: Map<string, PageLink[]>, figNum: string, link: PageLink) {
  if (!resolved.has(figNum)) {
    resolved.set(figNum, []);
  }
  resolved.get(figNum)!.push(link);
}

/** Check if a page is already linked to a figure */
function isAlreadyLinked(resolved: Map<string, PageLink[]>, figNum: string, pageIndex: number): boolean {
  const links = resolved.get(figNum);
  return links ? links.some((l) => l.pageIndex === pageIndex) : false;
}

/** Parse a page reference like "73-24" into a 0-indexed page number */
function parsePageReference(pageRef: string): number | null {
  // Handle "73-24" format (chapter-page) — take the last number as 1-indexed page
  const parts = pageRef.split("-");
  const lastPart = parts[parts.length - 1];
  const num = parseInt(lastPart, 10);
  if (isNaN(num)) return null;
  return num - 1; // Convert to 0-indexed
}

// ── finalizePass1 ─────────────────────────────────────────────────────

/**
 * All pages classified — resolve references, group into sections, create DB records.
 */
async function finalizePass1(templateId: string, progress: Pass1Progress): Promise<"done" | 0> {
  const template = await prisma.inspectionTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  const classifications = progress.classifiedSoFar;

  // Group diagram pages by figure number
  const figureGroups = new Map<string, FigureGroup>();
  const textPages: { pageIndex: number; result: PageClassification }[] = [];

  for (const { pageIndex, result } of classifications) {
    if (result.pageType === "diagram" && result.figureNumber) {
      const key = result.figureNumber;
      if (!figureGroups.has(key)) {
        figureGroups.set(key, {
          figureNumber: key,
          title: result.subAssemblyTitle || `Figure ${key}`,
          pages: [],
          supplementaryPages: [],
          partNumbers: [],
        });
      }
      const group = figureGroups.get(key)!;
      group.pages.push({
        pageIndex,
        sheetNumber: result.sheetNumber || 1,
        classification: result,
      });
      for (const pn of result.partNumbers) {
        if (!group.partNumbers.includes(pn)) {
          group.partNumbers.push(pn);
        }
      }
      if (
        result.subAssemblyTitle &&
        result.subAssemblyTitle.length > group.title.length
      ) {
        group.title = result.subAssemblyTitle;
      }
    } else if (result.pageType !== "ignore") {
      // Everything that isn't a diagram-with-figure or ignore goes to reference resolution.
      // This includes inspection_text, parts_list, AND diagrams without figure numbers
      // (e.g., rework/repair drawings that don't have a "FIGURE XXX" label).
      textPages.push({ pageIndex, result });
    }
  }

  // Resolve page references — explicit first, proximity fallback
  const { resolved, unresolved } = resolvePageReferences(classifications, figureGroups);

  // Log resolution results
  let explicitCount = 0;
  let proximityCount = 0;
  for (const links of resolved.values()) {
    for (const link of links) {
      if (link.reason === "proximity") proximityCount++;
      else if (link.reason !== "diagram_page") explicitCount++;
    }
  }
  console.log(
    `[CMM Pass 1] Reference resolution: ${explicitCount} explicit links, ` +
      `${proximityCount} proximity links, ${unresolved.length} unresolved pages`
  );

  // Sort pages within each group by sheet number
  for (const group of figureGroups.values()) {
    group.pages.sort((a, b) => a.sheetNumber - b.sheetNumber);
  }

  // Create InspectionSection records
  const sortedGroups = Array.from(figureGroups.values()).sort(
    (a, b) => (a.pages[0]?.pageIndex ?? 0) - (b.pages[0]?.pageIndex ?? 0)
  );

  if (sortedGroups.length === 0) {
    return 0;
  }

  let sortOrder = 0;
  for (const group of sortedGroups) {
    // Get resolved links for this figure
    const pageLinks = resolved.get(group.figureNumber) || [];

    // Build pageNumbers from resolved links (all unique page indices)
    const pageNumbers = [...new Set(pageLinks.map((l) => l.pageIndex))].sort(
      (a, b) => a - b
    );

    const sheetInfo =
      group.pages.length > 1
        ? `${group.pages.length} sheets`
        : undefined;

    await prisma.inspectionSection.create({
      data: {
        templateId,
        organizationId: template.organizationId,
        title: group.title,
        figureNumber: group.figureNumber,
        sheetInfo,
        pageNumbers,
        pageLinks: JSON.parse(JSON.stringify(pageLinks)),
        status: "pending",
        pageClassification: "diagram",
        configurationApplicability: group.partNumbers,
        sortOrder: sortOrder++,
      },
    });
  }

  // Store the full index in extractionMetadata (replace pass1Progress with final data)
  const indexData = {
    completedAt: new Date().toISOString(),
    totalPagesProcessed: progress.pagesToProcess.length,
    diagramPages: classifications.filter((c) => c.result.pageType === "diagram").length,
    textPages: textPages.length,
    ignoredPages: classifications.filter(
      (c) => c.result.pageType === "ignore"
    ).length,
    unresolvedPages: unresolved,
    figures: sortedGroups.map((g) => {
      const links = resolved.get(g.figureNumber) || [];
      const supplementaryLinks = links.filter((l) => l.reason !== "diagram_page");
      return {
        figureNumber: g.figureNumber,
        title: g.title,
        pageCount: g.pages.length,
        supplementaryPages: supplementaryLinks.length,
        linkBreakdown: {
          explicit: supplementaryLinks.filter((l) => l.reason !== "proximity").length,
          proximity: supplementaryLinks.filter((l) => l.reason === "proximity").length,
        },
      };
    }),
    rawClassifications: classifications.map((c) => ({
      page: c.pageIndex + 1,
      ...c.result,
    })),
  };

  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      extractionMetadata: JSON.parse(JSON.stringify(indexData)),
      status: "extracting_details",
    },
  });

  console.log(
    `[CMM Pass 1] Complete: ${sortedGroups.length} sections created from ${progress.pagesToProcess.length} pages`
  );

  return "done";
}
