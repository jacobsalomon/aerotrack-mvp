// Pass 2: Deep extraction with dual-model consensus for 99%+ accuracy.
// Sends each page individually to Gemini 2.5 Pro AND Claude Sonnet 4.6 in parallel,
// then reconciles their outputs field-by-field. Items both models agree on get
// confidence 1.0. Disagreements get flagged for human review.

import { prisma } from "@/lib/db";
import { extractSinglePageAsBase64 } from "@/lib/pdf-utils";
import { callGemini } from "./provider";
import { getApiKey, getApiBase } from "./models";
import { PASS2_EXTRACTION_PROMPT, PASS2_CLAUDE_SUFFIX } from "./cmm-prompts";
import {
  validateExtractionResults,
  reconcileExtractions,
  deduplicateItems,
  type ExtractedItem,
  type DisagreementRecord,
} from "./cmm-validation";

// The JSON structure both models return
interface ExtractionResponse {
  items: ExtractedItem[];
  sectionConfidence: number;
  extractionNotes: string;
}

// Per-page extraction result before merging
interface PageExtractionResult {
  pageIndex: number;
  items: ExtractedItem[];
  geminiSucceeded: boolean;
  claudeSucceeded: boolean;
  agreementRate: number;
  disagreements: DisagreementRecord[];
}

// ── Provider-specific single-page extraction helpers ──────────────────

// Call Gemini 2.5 Pro with a single PDF page
async function extractWithGemini(
  pageBase64: string,
  prompt: string
): Promise<ExtractedItem[]> {
  const responseText = await callGemini({
    model: "gemini-2.5-pro",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "application/pdf", data: pageBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    timeoutMs: 90000, // Single page — Gemini Pro can be slow on dense diagrams
  });

  const parsed = JSON.parse(responseText) as ExtractionResponse;
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("Gemini response missing items array");
  }
  return parsed.items;
}

// Call Claude Sonnet 4.6 with a single PDF page
async function extractWithClaude(
  pageBase64: string,
  prompt: string
): Promise<ExtractedItem[]> {
  const apiKey = getApiKey("anthropic");
  const apiBase = getApiBase("anthropic");

  const response = await fetch(`${apiBase}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pageBase64,
              },
            },
            { type: "text", text: prompt + PASS2_CLAUDE_SUFFIX },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || "";

  // Claude doesn't support responseMimeType, so strip markdown fences if present
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const parsed = JSON.parse(jsonText) as ExtractionResponse;
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("Claude response missing items array");
  }
  return parsed.items;
}

// ── Core: extract one page with dual-model consensus ──────────────────

async function extractPageWithConsensus(
  pageBase64: string,
  prompt: string,
  pageIndex: number
): Promise<PageExtractionResult> {
  // Fire both models in parallel
  const [geminiResult, claudeResult] = await Promise.allSettled([
    extractWithGemini(pageBase64, prompt),
    extractWithClaude(pageBase64, prompt),
  ]);

  const geminiItems = geminiResult.status === "fulfilled" ? geminiResult.value : null;
  const claudeItems = claudeResult.status === "fulfilled" ? claudeResult.value : null;

  if (geminiResult.status === "rejected") {
    console.warn(`[Consensus] Gemini failed on page ${pageIndex + 1}: ${geminiResult.reason}`);
  }
  if (claudeResult.status === "rejected") {
    console.warn(`[Consensus] Claude failed on page ${pageIndex + 1}: ${claudeResult.reason}`);
  }

  // Case 1: Both models returned results — reconcile
  if (geminiItems && claudeItems) {
    const consensus = reconcileExtractions(geminiItems, claudeItems);
    return {
      pageIndex,
      items: consensus.items,
      geminiSucceeded: true,
      claudeSucceeded: true,
      agreementRate: consensus.agreementRate,
      disagreements: consensus.disagreements,
    };
  }

  // Case 2: Only one model succeeded — use its results with lower confidence
  const singleModelItems = geminiItems || claudeItems || [];
  const itemsWithReducedConfidence = singleModelItems.map((item) => ({
    ...item,
    confidence: Math.min(item.confidence, 0.7), // Cap at 0.7 for single-model
  }));

  return {
    pageIndex,
    items: itemsWithReducedConfidence,
    geminiSucceeded: !!geminiItems,
    claudeSucceeded: !!claudeItems,
    agreementRate: 0, // No consensus possible
    disagreements: [],
  };
}

// ── Main: extract a full section page-by-page ─────────────────────────

/**
 * Extract specs from a single section using per-page dual-model consensus.
 * Returns the number of items created.
 */
export async function extractSection(
  templateId: string,
  sectionId: string
): Promise<number> {
  const section = await prisma.inspectionSection.findUniqueOrThrow({
    where: { id: sectionId },
    include: { template: true },
  });

  await prisma.inspectionSection.update({
    where: { id: sectionId },
    data: { status: "extracting" },
  });

  try {
    // Download the PDF
    const pdfResponse = await fetch(section.template.sourceFileUrl);
    if (!pdfResponse.ok) throw new Error("Failed to download PDF");
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());

    // Build the prompt with section context
    const prompt = PASS2_EXTRACTION_PROMPT
      .replace("{figureNumber}", section.figureNumber)
      .replace("{sectionTitle}", section.title)
      .replace(
        "{partNumbers}",
        section.template.partNumbersCovered.join(", ") || "not specified"
      );

    // Extract each page individually and run consensus
    const allPageResults: PageExtractionResult[] = [];
    let totalAgreementRate = 0;
    let allDisagreements: DisagreementRecord[] = [];

    for (const pageIdx of section.pageNumbers) {
      const pageBase64 = await extractSinglePageAsBase64(pdfBytes, pageIdx);
      const pageResult = await extractPageWithConsensus(pageBase64, prompt, pageIdx);

      allPageResults.push(pageResult);
      totalAgreementRate += pageResult.agreementRate;
      allDisagreements = allDisagreements.concat(pageResult.disagreements);

      const modelInfo = pageResult.geminiSucceeded && pageResult.claudeSucceeded
        ? `consensus (${(pageResult.agreementRate * 100).toFixed(0)}% agree)`
        : pageResult.geminiSucceeded ? "Gemini only" : "Claude only";
      console.log(
        `[Consensus] Page ${pageIdx + 1}: ${pageResult.items.length} items — ${modelInfo}`
      );
    }

    // Merge all page results and remove cross-page duplicates
    const allItems = allPageResults.flatMap((r) => r.items);
    const dedupedItems = deduplicateItems(allItems);

    // Run structural validation on deduped items
    const { validatedItems, sectionConfidence } = validateExtractionResults(dedupedItems);

    // Delete any existing items for this section (in case of re-extraction)
    await prisma.inspectionItem.deleteMany({ where: { sectionId } });

    // Save items to database
    let sortOrder = 0;
    for (const { item, adjustedConfidence } of validatedItems) {
      await prisma.inspectionItem.create({
        data: {
          sectionId,
          itemType: item.itemType,
          itemCallout: item.itemCallout || null,
          partNumber: item.partNumber || null,
          parameterName: item.parameterName,
          specification: item.specification,
          specValueLow: item.specValueLow ?? null,
          specValueHigh: item.specValueHigh ?? null,
          specUnit: item.specUnit || null,
          specValueLowMetric: item.specValueLowMetric ?? null,
          specValueHighMetric: item.specValueHighMetric ?? null,
          specUnitMetric: item.specUnitMetric || null,
          toolsRequired: item.toolsRequired || [],
          checkReference: item.checkReference || null,
          repairReference: item.repairReference || null,
          specialAssemblyRef: item.specialAssemblyRef || null,
          configurationApplicability: item.configurationApplicability || [],
          notes: item.notes || null,
          sortOrder: sortOrder++,
          confidence: adjustedConfidence,
        },
      });
    }

    // Calculate stats for logging
    const avgAgreement = section.pageNumbers.length > 0
      ? totalAgreementRate / section.pageNumbers.length
      : 0;
    const bothSucceeded = allPageResults.filter((r) => r.geminiSucceeded && r.claudeSucceeded).length;

    // Update section with results
    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        status: "extracted",
        itemCount: validatedItems.length,
        extractionConfidence: sectionConfidence,
        rawExtractionResponse: JSON.parse(JSON.stringify({
          method: "dual-model-consensus",
          pagesProcessed: section.pageNumbers.length,
          consensusPages: bothSucceeded,
          averageAgreementRate: avgAgreement,
          totalDisagreements: allDisagreements.length,
          disagreements: allDisagreements.slice(0, 20), // Keep first 20 for review
          pageResults: allPageResults.map((r) => ({
            page: r.pageIndex + 1,
            items: r.items.length,
            gemini: r.geminiSucceeded,
            claude: r.claudeSucceeded,
            agreement: r.agreementRate,
          })),
        })),
      },
    });

    console.log(
      `[CMM Pass 2] Fig. ${section.figureNumber}: ${validatedItems.length} items ` +
        `(confidence: ${sectionConfidence.toFixed(2)}, ` +
        `consensus: ${bothSucceeded}/${section.pageNumbers.length} pages, ` +
        `agreement: ${(avgAgreement * 100).toFixed(0)}%)`
    );

    return validatedItems.length;
  } catch (error) {
    console.error(
      `[CMM Pass 2] Failed to extract Fig. ${section.figureNumber}:`,
      error
    );

    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        status: "failed",
        rawExtractionResponse: JSON.parse(JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
          failedAt: new Date().toISOString(),
        })),
      },
    });

    return 0;
  }
}
