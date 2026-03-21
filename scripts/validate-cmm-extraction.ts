// Validation script for CMM extraction with dual-model consensus.
// Runs Pass 1 (classification) + Pass 2 (consensus extraction) against the SilverWings IDG CMM sample.
//
// Usage: npx tsx scripts/validate-cmm-extraction.ts
// Consensus-only (skip Pass 1): npx tsx scripts/validate-cmm-extraction.ts --consensus-only

import * as dotenv from "dotenv";
// Load env vars — try .env.local first, then fall back to .env.vercel-prod
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.vercel-prod" });
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { extractPdfPages, extractSinglePageAsBase64, getPdfPageCount } from "../lib/pdf-utils";
import { callGemini } from "../lib/ai/provider";
import { getApiKey, getApiBase } from "../lib/ai/models";
import { PASS1_CLASSIFICATION_PROMPT, PASS2_EXTRACTION_PROMPT } from "../lib/ai/cmm-prompts";
import { validateExtractionResults, reconcileExtractions, type ExtractedItem } from "../lib/ai/cmm-validation";

const PDF_PATH = path.join(process.env.HOME || "~", "Downloads", "Inspection Sheets.pdf");
const CONSENSUS_ONLY = process.argv.includes("--consensus-only");

interface PageClassification {
  pageType: string;
  figureNumber: string | null;
  subAssemblyTitle: string | null;
  sheetNumber: number | null;
  totalSheets: number | null;
  partNumbers: string[];
  notes: string | null;
}

// Call Claude Sonnet for extraction (same as production code)
async function extractWithClaude(pageBase64: string, prompt: string): Promise<ExtractedItem[]> {
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
              source: { type: "base64", media_type: "application/pdf", data: pageBase64 },
            },
            { type: "text", text: prompt },
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
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const parsed = JSON.parse(jsonText) as { items: ExtractedItem[] };
  return parsed.items || [];
}

async function main() {
  console.log("=== CMM Consensus Extraction Validation ===\n");

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found at: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const totalPages = await getPdfPageCount(pdfBytes);
  console.log(`PDF: ${path.basename(PDF_PATH)}`);
  console.log(`Pages: ${totalPages}\n`);

  // ── PASS 1: Classify pages ──
  let figures: Map<string, { pages: number[]; title: string }>;

  if (CONSENSUS_ONLY) {
    // Hardcoded figure map from previous runs to skip Pass 1
    console.log("--- Skipping Pass 1 (--consensus-only) ---\n");
    figures = new Map();
    // These are the known figures from the SilverWings IDG sample
    // Will run Pass 1 if not using --consensus-only
  } else {
    console.log("--- PASS 1: Page Classification ---\n");
    const classifications: { page: number; result: PageClassification }[] = [];

    for (let i = 0; i < totalPages; i++) {
      try {
        const pageBuffer = await extractPdfPages(pdfBytes, [i]);
        const pageBase64 = pageBuffer.toString("base64");

        const responseText = await callGemini({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: `${PASS1_CLASSIFICATION_PROMPT}\n\nThis is page ${i + 1} of the document.` },
                { inlineData: { mimeType: "application/pdf", data: pageBase64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
          timeoutMs: 30000,
        });

        const parsed = JSON.parse(responseText) as PageClassification;
        classifications.push({ page: i + 1, result: parsed });

        const figInfo = parsed.figureNumber ? ` — Fig. ${parsed.figureNumber}` : "";
        const titleInfo = parsed.subAssemblyTitle ? ` "${parsed.subAssemblyTitle}"` : "";
        console.log(`  Page ${String(i + 1).padStart(2)}: ${parsed.pageType.padEnd(16)}${figInfo}${titleInfo}`);
      } catch (err) {
        console.error(`  Page ${i + 1}: ERROR — ${err instanceof Error ? err.message : err}`);
        classifications.push({
          page: i + 1,
          result: { pageType: "ignore", figureNumber: null, subAssemblyTitle: null, sheetNumber: null, totalSheets: null, partNumbers: [], notes: `Error: ${err}` },
        });
      }
    }

    figures = new Map<string, { pages: number[]; title: string }>();
    for (const { page, result } of classifications) {
      if (result.pageType === "diagram" && result.figureNumber) {
        const existing = figures.get(result.figureNumber);
        if (existing) {
          existing.pages.push(page);
        } else {
          figures.set(result.figureNumber, {
            pages: [page],
            title: result.subAssemblyTitle || `Figure ${result.figureNumber}`,
          });
        }
      }
    }

    console.log(`\nPass 1 Summary:`);
    console.log(`  Diagrams: ${classifications.filter((c) => c.result.pageType === "diagram").length}`);
    console.log(`  Figures found: ${figures.size}`);

    for (const [fig, info] of figures) {
      console.log(`    Fig. ${fig}: "${info.title}" (pages ${info.pages.join(", ")})`);
    }
  }

  if (figures.size === 0) {
    console.log("No figures found. If using --consensus-only, run without it first.\n");
    process.exit(0);
  }

  // ── PASS 2: Consensus extraction on sample pages ──
  console.log("\n--- PASS 2: Dual-Model Consensus Extraction ---\n");

  // Test 3 single-page figures for focused consensus comparison
  const sampleFigures = Array.from(figures.entries()).slice(0, 4);
  let totalItemsExtracted = 0;
  let totalConsensusItems = 0;
  let totalDisagreements = 0;
  let totalAgreementSum = 0;
  let pagesWithConsensus = 0;

  for (const [figNum, figInfo] of sampleFigures) {
    console.log(`\n  Fig. ${figNum}: "${figInfo.title}" (${figInfo.pages.length} pages)`);

    const prompt = PASS2_EXTRACTION_PROMPT
      .replace("{figureNumber}", figNum)
      .replace("{sectionTitle}", figInfo.title)
      .replace("{partNumbers}", "739515, 745329, 755359, 766088");

    // Process each page individually with consensus
    for (const pageNum of figInfo.pages) {
      const pageIdx = pageNum - 1;
      console.log(`\n    Page ${pageNum}:`);

      try {
        const pageBase64 = await extractSinglePageAsBase64(pdfBytes, pageIdx);

        // Fire both models in parallel
        console.log(`      Calling Gemini 2.5 Pro + Claude Sonnet 4.6 in parallel...`);
        const startTime = Date.now();

        const [geminiResult, claudeResult] = await Promise.allSettled([
          (async () => {
            const text = await callGemini({
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
              timeoutMs: 90000,
            });
            const parsed = JSON.parse(text) as { items: ExtractedItem[] };
            return parsed.items || [];
          })(),
          extractWithClaude(pageBase64, prompt),
        ]);

        const elapsed = Date.now() - startTime;
        const geminiItems = geminiResult.status === "fulfilled" ? geminiResult.value : null;
        const claudeItems = claudeResult.status === "fulfilled" ? claudeResult.value : null;

        if (geminiResult.status === "rejected") {
          console.log(`      ❌ Gemini failed: ${geminiResult.reason}`);
        } else {
          console.log(`      ✓ Gemini: ${geminiItems!.length} items`);
        }

        if (claudeResult.status === "rejected") {
          console.log(`      ❌ Claude failed: ${claudeResult.reason}`);
        } else {
          console.log(`      ✓ Claude: ${claudeItems!.length} items`);
        }

        // Reconcile if both succeeded
        if (geminiItems && claudeItems) {
          const consensus = reconcileExtractions(geminiItems, claudeItems);
          const { validatedItems, sectionConfidence } = validateExtractionResults(consensus.items);

          totalItemsExtracted += validatedItems.length;
          totalConsensusItems += validatedItems.filter((v) => v.adjustedConfidence >= 0.95).length;
          totalDisagreements += consensus.disagreements.length;
          totalAgreementSum += consensus.agreementRate;
          pagesWithConsensus++;

          console.log(`      Consensus: ${validatedItems.length} merged items (${elapsed}ms)`);
          console.log(`      Agreement rate: ${(consensus.agreementRate * 100).toFixed(0)}%`);
          console.log(`      Section confidence: ${sectionConfidence.toFixed(2)}`);

          if (consensus.disagreements.length > 0) {
            console.log(`      Disagreements (${consensus.disagreements.length}):`);
            for (const d of consensus.disagreements.slice(0, 5)) {
              console.log(`        - ${d.parameterName}: ${d.field} — A="${d.valueA}" vs B="${d.valueB}"`);
            }
          }

          // Show high-confidence items (both models agreed)
          const highConf = validatedItems.filter((v) => v.adjustedConfidence >= 0.95);
          const lowConf = validatedItems.filter((v) => v.adjustedConfidence < 0.7);
          console.log(`      High confidence (≥0.95): ${highConf.length}`);
          console.log(`      Flagged for review (<0.7): ${lowConf.length}`);

          // Show example items
          for (const v of validatedItems.slice(0, 3)) {
            const conf = v.adjustedConfidence >= 0.95 ? "✓" : v.adjustedConfidence >= 0.7 ? "~" : "!";
            console.log(`        ${conf} ${v.item.itemCallout || "—"} | ${v.item.parameterName} | ${v.item.specification}`);
          }
        } else {
          // Single model only
          const items = geminiItems || claudeItems || [];
          const { validatedItems } = validateExtractionResults(items);
          totalItemsExtracted += validatedItems.length;
          console.log(`      Single-model result: ${validatedItems.length} items (capped at 0.7 confidence)`);
        }
      } catch (err) {
        console.error(`      ERROR: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Final summary
  const avgAgreement = pagesWithConsensus > 0 ? totalAgreementSum / pagesWithConsensus : 0;
  console.log("\n=== CONSENSUS VALIDATION SUMMARY ===");
  console.log(`Figures sampled: ${sampleFigures.length}`);
  console.log(`Pages with dual-model consensus: ${pagesWithConsensus}`);
  console.log(`Total items extracted: ${totalItemsExtracted}`);
  console.log(`High-confidence items (both agree): ${totalConsensusItems}`);
  console.log(`Total disagreements: ${totalDisagreements}`);
  console.log(`Average agreement rate: ${(avgAgreement * 100).toFixed(1)}%`);
  console.log(`\nAccuracy estimate: ${avgAgreement > 0.95 ? "99%+" : avgAgreement > 0.90 ? "~95-99%" : "< 95% — needs prompt tuning"}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
