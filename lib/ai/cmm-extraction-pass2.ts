// Pass 2: Deep extraction with dual-model consensus for 99%+ accuracy.
// Sends each page individually to Gemini 2.5 Pro AND Claude Sonnet in parallel,
// then reconciles their outputs field-by-field. Uses responseSchema for Gemini
// and system prompts for Claude to maximize extraction completeness.

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { extractSinglePageAsBase64 } from "@/lib/pdf-utils";
import { callGemini } from "./provider";
import { getApiKey, getApiBase } from "./models";
import {
  PASS2_SYSTEM_INSTRUCTION,
  PASS2_EXTRACTION_PROMPT,
  PASS2_CLAUDE_ADDITIONS,
  CMM_EXTRACTION_SCHEMA,
} from "./cmm-prompts";
import { ocrPage, formatOcrForPrompt, type OcrResult } from "./ocr-service";
import {
  validateExtractionResults,
  reconcileExtractions,
  deduplicateItems,
  type ExtractedItem,
  type DisagreementRecord,
} from "./cmm-validation";

// The JSON structure both models return (now includes pageAnalysis)
interface ExtractionResponse {
  pageAnalysis?: string;
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

// Call Gemini 2.5 Pro with responseSchema for guaranteed structure
async function extractWithGemini(
  pageBase64: string,
  prompt: string
): Promise<ExtractedItem[]> {
  const responseText = await callGemini({
    model: "gemini-2.5-pro",
    systemInstruction: {
      parts: [{ text: PASS2_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "application/pdf", data: pageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: CMM_EXTRACTION_SCHEMA,
    },
    timeoutMs: 240000, // 4 min — Gemini Pro can be slow on dense diagrams
  });

  const parsed = JSON.parse(responseText) as ExtractionResponse;
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("Gemini response missing items array");
  }
  if (parsed.pageAnalysis) {
    console.log(`[Gemini] Page analysis: ${parsed.pageAnalysis.slice(0, 200)}...`);
  }
  return parsed.items;
}

// Call Claude Sonnet with system prompt for better extraction
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
    signal: AbortSignal.timeout(240000), // 4 min — match Gemini timeout
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384, // Increased from 8192 for dense pages with pageAnalysis
      system: PASS2_SYSTEM_INSTRUCTION, // Role + extraction authority in system prompt
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
            { type: "text", text: prompt + PASS2_CLAUDE_ADDITIONS },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || "";

  // Strip markdown fences if present (Claude may still add them)
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const parsed = JSON.parse(jsonText) as ExtractionResponse;
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("Claude response missing items array");
  }
  if (parsed.pageAnalysis) {
    console.log(`[Claude] Page analysis: ${parsed.pageAnalysis.slice(0, 200)}...`);
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

// ── Per-page progress tracking (stored in InspectionSection.pass2Progress) ──

// A single page's extraction result, persisted before the next page starts
interface PersistedPageResult {
  pageIndex: number;
  items: ExtractedItem[];
  geminiSucceeded: boolean;
  claudeSucceeded: boolean;
  agreementRate: number;
  disagreements: DisagreementRecord[];
  completedAt: string;
  ocrResult?: OcrResult; // Cached OCR result — reused on retry to avoid redundant API calls
}

// The full progress state for a section's Pass 2 extraction
interface Pass2Progress {
  pageResults: PersistedPageResult[];
  nextPageOffset: number; // Index into section.pageNumbers (not the page index itself)
  retries?: Record<number, number>; // pageOffset → retry count (tracks how many times a page has been attempted)
}

// Max retries per page before giving up on that page and moving on
const MAX_PAGE_RETRIES = 3;

// ── Page-resumable extraction ─────────────────────────────────────────

/**
 * Extract ONE page of a section with dual-model consensus and persist the result.
 * Returns:
 * - "continue" if more pages remain in this section
 * - "finalize" if all pages are done and the section needs finalization
 */
export async function extractSectionPage(
  templateId: string,
  sectionId: string,
  preloadedPdf?: Buffer,
): Promise<"continue" | "finalize"> {
  const section = await prisma.inspectionSection.findUniqueOrThrow({
    where: { id: sectionId },
    include: { template: true },
  });

  // Ensure section is marked as extracting
  if (section.status === "pending") {
    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: { status: "extracting" },
    });
  }

  // Load or initialize progress
  let progress: Pass2Progress;
  if (section.pass2Progress) {
    progress = section.pass2Progress as unknown as Pass2Progress;
  } else {
    progress = { pageResults: [], nextPageOffset: 0 };
  }

  // Check if all pages already processed
  if (progress.nextPageOffset >= section.pageNumbers.length) {
    return "finalize";
  }

  const pageIdx = section.pageNumbers[progress.nextPageOffset];

  try {
    // Use preloaded PDF if provided, otherwise download
    let pdfBytes: Buffer;
    if (preloadedPdf) {
      pdfBytes = preloadedPdf;
    } else {
      const pdfResponse = await fetch(section.template.sourceFileUrl);
      if (!pdfResponse.ok) throw new Error("Failed to download PDF");
      pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    }

    // Extract this single page as base64 PDF
    const pageBase64 = await extractSinglePageAsBase64(pdfBytes, pageIdx);

    // ── OCR step: run Mathpix OCR before LLM extraction ──
    // Check if we already have a cached OCR result from a previous attempt
    // (avoids redundant API calls on retry)
    let ocrResult: OcrResult;
    const existingOcr = progress.pageResults.find(
      (r) => r.pageIndex === pageIdx && r.ocrResult
    );
    if (existingOcr?.ocrResult) {
      ocrResult = existingOcr.ocrResult;
      console.log(`[CMM Pass 2] Reusing cached OCR for page ${pageIdx + 1} (${ocrResult.source})`);
    } else {
      ocrResult = await ocrPage(pageBase64);
    }

    // Format OCR text for prompt injection
    const ocrPromptText = formatOcrForPrompt(ocrResult);

    // Build the prompt with section context + OCR text
    const prompt = PASS2_EXTRACTION_PROMPT
      .replace("{figureNumber}", section.figureNumber)
      .replace("{sectionTitle}", section.title)
      .replace(
        "{partNumbers}",
        section.template.partNumbersCovered.join(", ") || "not specified"
      )
      .replace("{ocrText}", ocrPromptText);

    // Extract with dual-model consensus (OCR text is already in the prompt)
    const pageResult = await extractPageWithConsensus(pageBase64, prompt, pageIdx);

    const modelInfo = pageResult.geminiSucceeded && pageResult.claudeSucceeded
      ? `consensus (${(pageResult.agreementRate * 100).toFixed(0)}% agree)`
      : pageResult.geminiSucceeded ? "Gemini only" : "Claude only";
    const ocrInfo = ocrResult.source !== "none"
      ? ` | OCR: ${ocrResult.source} (${ocrResult.fullText.length} chars, ${ocrResult.tables.length} tables)`
      : " | OCR: none";
    console.log(
      `[CMM Pass 2] Fig. ${section.figureNumber} page ${progress.nextPageOffset + 1}/${section.pageNumbers.length} ` +
        `(PDF page ${pageIdx + 1}): ${pageResult.items.length} items — ${modelInfo}${ocrInfo}`
    );

    // Persist result with OCR — this is the key to resumability
    progress.pageResults.push({
      pageIndex: pageResult.pageIndex,
      items: pageResult.items,
      geminiSucceeded: pageResult.geminiSucceeded,
      claudeSucceeded: pageResult.claudeSucceeded,
      agreementRate: pageResult.agreementRate,
      disagreements: pageResult.disagreements,
      completedAt: new Date().toISOString(),
      ocrResult, // Cache OCR so retries don't re-run the API
    });
    progress.nextPageOffset++;

    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        pass2Progress: JSON.parse(JSON.stringify(progress)),
      },
    });

    // Are there more pages?
    if (progress.nextPageOffset >= section.pageNumbers.length) {
      return "finalize";
    }
    return "continue";
  } catch (error) {
    // Track retries per page — retry up to MAX_PAGE_RETRIES times before giving up
    if (!progress.retries) progress.retries = {};
    const retryCount = (progress.retries[progress.nextPageOffset] ?? 0) + 1;
    progress.retries[progress.nextPageOffset] = retryCount;

    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    if (retryCount < MAX_PAGE_RETRIES) {
      // Save retry count but keep section as extracting — the runner will try this page again
      console.warn(
        `[CMM Pass 2] Fig. ${section.figureNumber} page ${pageIdx + 1} failed (attempt ${retryCount}/${MAX_PAGE_RETRIES}): ${errorMsg}`
      );

      await prisma.inspectionSection.update({
        where: { id: sectionId },
        data: {
          pass2Progress: JSON.parse(JSON.stringify(progress)),
        },
      });

      // Return "continue" so the runner releases the lease and retries next poll
      return "continue";
    }

    // Max retries exhausted — skip this page and move on to the next one
    console.error(
      `[CMM Pass 2] Fig. ${section.figureNumber} page ${pageIdx + 1} failed after ${MAX_PAGE_RETRIES} attempts, skipping: ${errorMsg}`
    );

    progress.nextPageOffset++;

    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        pass2Progress: JSON.parse(JSON.stringify(progress)),
      },
    });

    // Check if there are more pages after skipping this one
    if (progress.nextPageOffset >= section.pageNumbers.length) {
      return "finalize";
    }
    return "continue";
  }
}

/**
 * Finalize a section after all pages have been extracted.
 * Merges per-page results, deduplicates items, validates, and saves to DB.
 * Returns the number of items created.
 */
export async function finalizeSectionExtraction(
  sectionId: string
): Promise<number> {
  const section = await prisma.inspectionSection.findUniqueOrThrow({
    where: { id: sectionId },
  });

  const progress = section.pass2Progress as Pass2Progress | null;
  if (!progress || progress.pageResults.length === 0) {
    console.warn(`[CMM Pass 2] No page results to finalize for section ${sectionId}`);
    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: { status: "failed" },
    });
    return 0;
  }

  try {
    // Merge all page results and remove cross-page duplicates
    const allItems = progress.pageResults.flatMap((r) => r.items);
    const dedupedItems = deduplicateItems(allItems);

    // Run structural validation on deduped items
    const { validatedItems, sectionConfidence } = validateExtractionResults(dedupedItems);

    // Delete any existing items for this section (in case of re-extraction)
    await prisma.inspectionItem.deleteMany({ where: { sectionId } });

    // Save items to database
    let sortOrder = 0;
    for (const { item, adjustedConfidence, reviewReason } of validatedItems) {
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
          reviewReason: reviewReason || null,
          instanceCount: Math.min(Math.max(item.instanceCount ?? 1, 1), 100),
          instanceLabels: item.instanceLabels || [],
        },
      });
    }

    // Calculate stats for logging
    const totalAgreementRate = progress.pageResults.reduce((sum, r) => sum + r.agreementRate, 0);
    const avgAgreement = progress.pageResults.length > 0
      ? totalAgreementRate / progress.pageResults.length
      : 0;
    const bothSucceeded = progress.pageResults.filter(
      (r) => r.geminiSucceeded && r.claudeSucceeded
    ).length;
    const allDisagreements = progress.pageResults.flatMap((r) => r.disagreements);

    // Update section with final results
    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        status: "extracted",
        itemCount: validatedItems.length,
        extractionConfidence: sectionConfidence,
        rawExtractionResponse: JSON.parse(JSON.stringify({
          method: "dual-model-consensus-v3-ocr-enriched",
          pagesProcessed: progress.pageResults.length,
          consensusPages: bothSucceeded,
          averageAgreementRate: avgAgreement,
          totalDisagreements: allDisagreements.length,
          disagreements: allDisagreements,
          pageResults: progress.pageResults.map((r) => ({
            page: r.pageIndex + 1,
            items: r.items.length,
            gemini: r.geminiSucceeded,
            claude: r.claudeSucceeded,
            agreement: r.agreementRate,
            ocr: r.ocrResult ? {
              source: r.ocrResult.source,
              confidence: r.ocrResult.confidence,
              textLength: r.ocrResult.fullText.length,
              tables: r.ocrResult.tables.length,
              processingTimeMs: r.ocrResult.processingTimeMs,
            } : null,
          })),
        })),
      },
    });

    console.log(
      `[CMM Pass 2] Finalized Fig. ${section.figureNumber}: ${validatedItems.length} items ` +
        `(confidence: ${sectionConfidence.toFixed(2)}, ` +
        `consensus: ${bothSucceeded}/${progress.pageResults.length} pages, ` +
        `agreement: ${(avgAgreement * 100).toFixed(0)}%)`
    );

    return validatedItems.length;
  } catch (error) {
    console.error(
      `[CMM Pass 2] Failed to finalize Fig. ${section.figureNumber}:`,
      error
    );

    await prisma.inspectionSection.update({
      where: { id: sectionId },
      data: {
        status: "failed",
        rawExtractionResponse: JSON.parse(JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
          failedAt: new Date().toISOString(),
          phase: "finalization",
        })),
      },
    });

    return 0;
  }
}

/**
 * Convenience wrapper: extract all pages of a section then finalize.
 * Used by the re-extract endpoint (processes everything in one go).
 * The runner uses extractSectionPage + finalizeSectionExtraction individually.
 */
export async function extractSection(
  templateId: string,
  sectionId: string
): Promise<number> {
  // Clear any existing progress for a fresh extraction
  await prisma.inspectionSection.update({
    where: { id: sectionId },
    data: { pass2Progress: Prisma.DbNull, status: "extracting" },
  });

  // Process all pages one by one
  let result: "continue" | "finalize" = "continue";
  while (result === "continue") {
    result = await extractSectionPage(templateId, sectionId);
  }

  // Finalize: merge, dedup, validate, save items
  return finalizeSectionExtraction(sectionId);
}
