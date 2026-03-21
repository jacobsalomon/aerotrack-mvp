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
// Gemini 2.5 Flash takes ~5-10s per page for classification.
// 15 pages × 10s = 150s + PDF download/parse overhead ≈ 180s.
// Well within the 300s serverless limit with safety margin.
const PAGES_PER_BATCH = 15;

// The structure Gemini returns for each page
interface PageClassification {
  pageType: "diagram" | "inspection_text" | "parts_list" | "ignore";
  figureNumber: string | null;
  subAssemblyTitle: string | null;
  sheetNumber: number | null;
  totalSheets: number | null;
  partNumbers: string[];
  notes: string | null;
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

  // Classify each page sequentially for maximum accuracy
  for (const pageIndex of batchPages) {
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
      progress.classifiedSoFar.push({ pageIndex, result: parsed });

      console.log(
        `[CMM Pass 1] Page ${pageIndex + 1}: ${parsed.pageType}` +
          (parsed.figureNumber ? ` — Fig. ${parsed.figureNumber}` : "") +
          (parsed.subAssemblyTitle ? ` "${parsed.subAssemblyTitle}"` : "")
      );
    } catch (error) {
      console.error(`[CMM Pass 1] Error classifying page ${pageIndex + 1}:`, error);
      progress.classifiedSoFar.push({
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
      });
    }
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

/**
 * All pages classified — group into sections, create DB records, return count.
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
    } else if (result.pageType === "inspection_text") {
      textPages.push({ pageIndex, result });
    }
  }

  // Link text pages to their nearest diagram section
  for (const textPage of textPages) {
    let closestFigure: FigureGroup | null = null;
    let closestDistance = Infinity;

    for (const group of figureGroups.values()) {
      for (const page of group.pages) {
        const distance = Math.abs(page.pageIndex - textPage.pageIndex);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestFigure = group;
        }
      }
    }

    if (closestFigure && closestDistance <= 3) {
      closestFigure.supplementaryPages.push(textPage.pageIndex);
    }
  }

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
    const pageNumbers = [
      ...group.pages.map((p) => p.pageIndex),
      ...group.supplementaryPages,
    ].sort((a, b) => a - b);

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
      (c) => c.result.pageType === "ignore" || c.result.pageType === "parts_list"
    ).length,
    figures: sortedGroups.map((g) => ({
      figureNumber: g.figureNumber,
      title: g.title,
      pageCount: g.pages.length,
      supplementaryPages: g.supplementaryPages.length,
    })),
    rawClassifications: classifications.map((c) => ({
      page: c.pageIndex + 1,
      ...c.result,
    })),
  };

  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      extractionMetadata: indexData,
      status: "extracting_details",
    },
  });

  console.log(
    `[CMM Pass 1] Complete: ${sortedGroups.length} sections created from ${progress.pagesToProcess.length} pages`
  );

  return "done";
}
