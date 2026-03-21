// Validation script for CMM extraction prompts.
// Runs Pass 1 + Pass 2 against the SilverWings IDG CMM sample
// and reports extraction results for accuracy assessment.
//
// Usage: npx tsx scripts/validate-cmm-extraction.ts

import * as dotenv from "dotenv";
// Load env vars — try .env.local first, then fall back to .env.vercel-prod
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.vercel-prod" });
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { extractPdfPages, getPdfPageCount } from "../lib/pdf-utils";
import { callGemini } from "../lib/ai/provider";
import { PASS1_CLASSIFICATION_PROMPT, PASS2_EXTRACTION_PROMPT } from "../lib/ai/cmm-prompts";
import { validateExtractionResults, type ExtractedItem } from "../lib/ai/cmm-validation";

const PDF_PATH = path.join(process.env.HOME || "~", "Downloads", "Inspection Sheets.pdf");

interface PageClassification {
  pageType: string;
  figureNumber: string | null;
  subAssemblyTitle: string | null;
  sheetNumber: number | null;
  totalSheets: number | null;
  partNumbers: string[];
  notes: string | null;
}

async function main() {
  console.log("=== CMM Extraction Validation ===\n");

  // Read the PDF
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found at: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const totalPages = await getPdfPageCount(pdfBytes);
  console.log(`PDF: ${path.basename(PDF_PATH)}`);
  console.log(`Pages: ${totalPages}\n`);

  // ── PASS 1: Classify pages ──
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

  // Group by figure number
  const figures = new Map<string, { pages: number[]; title: string }>();
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
  console.log(`  Text: ${classifications.filter((c) => c.result.pageType === "inspection_text").length}`);
  console.log(`  Parts lists: ${classifications.filter((c) => c.result.pageType === "parts_list").length}`);
  console.log(`  Ignored: ${classifications.filter((c) => c.result.pageType === "ignore").length}`);
  console.log(`  Figures found: ${figures.size}`);

  for (const [fig, info] of figures) {
    console.log(`    Fig. ${fig}: "${info.title}" (pages ${info.pages.join(", ")})`);
  }

  // ── PASS 2: Extract specs from 3 representative sections ──
  console.log("\n--- PASS 2: Deep Extraction (3 sample sections) ---\n");

  // Test 6 sections for a broader accuracy sample
  const sampleFigures = Array.from(figures.entries()).slice(0, 6);
  let totalItemsExtracted = 0;
  let totalValidationIssues = 0;

  for (const [figNum, figInfo] of sampleFigures) {
    console.log(`\n  Processing Fig. ${figNum}: "${figInfo.title}"...`);

    try {
      // Get the pages for this figure (convert from 1-based to 0-based)
      const pageIndices = figInfo.pages.map((p) => p - 1);
      const sectionPdf = await extractPdfPages(pdfBytes, pageIndices);
      const sectionBase64 = sectionPdf.toString("base64");

      const prompt = PASS2_EXTRACTION_PROMPT
        .replace("{figureNumber}", figNum)
        .replace("{sectionTitle}", figInfo.title)
        .replace("{partNumbers}", "739515, 745329, 755359, 766088");

      const responseText = await callGemini({
        model: "gemini-2.5-pro",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "application/pdf", data: sectionBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        timeoutMs: 120000,
      });

      const parsed = JSON.parse(responseText) as { items: ExtractedItem[]; sectionConfidence: number; extractionNotes: string };

      // Validate
      const { validatedItems, sectionConfidence, totalIssues } = validateExtractionResults(parsed.items);
      totalItemsExtracted += validatedItems.length;
      totalValidationIssues += totalIssues;

      console.log(`  Results:`);
      console.log(`    Items extracted: ${validatedItems.length}`);
      console.log(`    Section confidence: ${sectionConfidence.toFixed(2)}`);
      console.log(`    Validation issues: ${totalIssues}`);
      if (parsed.extractionNotes) {
        console.log(`    Notes: ${parsed.extractionNotes}`);
      }

      // Show item type breakdown
      const typeCounts = new Map<string, number>();
      for (const v of validatedItems) {
        typeCounts.set(v.item.itemType, (typeCounts.get(v.item.itemType) || 0) + 1);
      }
      console.log(`    Types: ${Array.from(typeCounts.entries()).map(([t, c]) => `${t}(${c})`).join(", ")}`);

      // Show low confidence items
      const lowConf = validatedItems.filter((v) => v.adjustedConfidence < 0.7);
      if (lowConf.length > 0) {
        console.log(`    Low confidence items (${lowConf.length}):`);
        for (const v of lowConf) {
          console.log(`      - ${v.item.parameterName}: ${v.adjustedConfidence.toFixed(2)} [${v.issues.join("; ")}]`);
        }
      }

      // Show first 5 items as examples
      console.log(`    Example items:`);
      for (const v of validatedItems.slice(0, 5)) {
        const tools = v.item.toolsRequired?.length ? ` [tools: ${v.item.toolsRequired.join(", ")}]` : "";
        console.log(`      ${v.item.itemCallout || "—"} | ${v.item.parameterName} | ${v.item.specification}${tools}`);
      }
    } catch (err) {
      console.error(`  ERROR extracting Fig. ${figNum}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Final summary
  console.log("\n=== VALIDATION SUMMARY ===");
  console.log(`Total figures found: ${figures.size}`);
  console.log(`Sections sampled: ${sampleFigures.length}`);
  console.log(`Total items extracted: ${totalItemsExtracted}`);
  console.log(`Total validation issues: ${totalValidationIssues}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Compare extracted items against the original PDF pages manually`);
  console.log(`  2. Count torque specs on 3 pages and compare to extraction output`);
  console.log(`  3. If accuracy < 85%, iterate on prompts in lib/ai/cmm-prompts.ts`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
