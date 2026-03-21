// Pass 1: Index a CMM PDF by classifying each page and identifying sub-assemblies.
// Sends each page individually to Gemini 2.5 Flash for fast classification.
// Groups multi-sheet figures into single sections.
// Creates InspectionSection records for each identified sub-assembly.

import { prisma } from "@/lib/db";
import { parsePdf } from "@/lib/pdf-utils";
import { callGemini } from "./provider";
import { PASS1_CLASSIFICATION_PROMPT } from "./cmm-prompts";

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

// A grouped figure (may span multiple pages/sheets)
interface FigureGroup {
  figureNumber: string;
  title: string;
  pages: { pageIndex: number; sheetNumber: number; classification: PageClassification }[];
  supplementaryPages: number[]; // inspection_text pages linked to this figure
  partNumbers: string[];
}

/**
 * Run Pass 1 on a template: classify all pages and create sections.
 * Returns the number of sections created.
 */
export async function runPass1(templateId: string): Promise<number> {
  // Load the template
  const template = await prisma.inspectionTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  // Download the PDF and parse it once (avoids re-parsing per page)
  const pdfResponse = await fetch(template.sourceFileUrl);
  if (!pdfResponse.ok) throw new Error("Failed to download PDF");
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  const pdf = await parsePdf(pdfBytes);

  // Determine which pages to process
  const pagesToProcess =
    template.inspectionPages.length > 0
      ? template.inspectionPages // Already 0-indexed from parsePageRanges
      : Array.from({ length: pdf.pageCount }, (_, i) => i);

  console.log(
    `[CMM Pass 1] Processing ${pagesToProcess.length} pages for template ${templateId}`
  );

  // Classify each page — run in parallel batches of 10 to stay within
  // the 300s serverless timeout. Sequential processing of 73 pages would
  // take ~36 minutes; parallel batches of 10 finish in ~3 minutes.
  const CONCURRENCY = 10;
  const classifications: { pageIndex: number; result: PageClassification }[] = [];

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

  // Process in batches of CONCURRENCY
  for (let i = 0; i < pagesToProcess.length; i += CONCURRENCY) {
    const batch = pagesToProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(classifyPage));
    classifications.push(...results);
    console.log(`[CMM Pass 1] Batch complete: ${Math.min(i + CONCURRENCY, pagesToProcess.length)}/${pagesToProcess.length} pages`);
  }

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
      // Merge part numbers
      for (const pn of result.partNumbers) {
        if (!group.partNumbers.includes(pn)) {
          group.partNumbers.push(pn);
        }
      }
      // Use the most descriptive title
      if (
        result.subAssemblyTitle &&
        result.subAssemblyTitle.length > group.title.length
      ) {
        group.title = result.subAssemblyTitle;
      }
    } else if (result.pageType === "inspection_text") {
      textPages.push({ pageIndex, result });
    }
    // parts_list and ignore pages are skipped from extraction
  }

  // Link text pages to their nearest diagram section
  // (text pages often contain checks, warnings, and tool lists that belong to nearby diagrams)
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

  // Store the full index in extractionMetadata
  const indexData = {
    completedAt: new Date().toISOString(),
    totalPagesProcessed: pagesToProcess.length,
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
    `[CMM Pass 1] Complete: ${sortedGroups.length} sections created from ${pagesToProcess.length} pages`
  );

  return sortedGroups.length;
}
