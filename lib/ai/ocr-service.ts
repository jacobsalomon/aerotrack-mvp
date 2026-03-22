// OCR service for CMM extraction pipeline.
// Uses Mathpix OCR API as the primary (and only) OCR provider.
// Mathpix handles both digital and scanned PDFs with high accuracy,
// including structured table recognition — exactly what we need for
// CMM test result forms and measurement logs.
//
// Cost: $0.01/page. A 73-page CMM costs ~$0.73. Worth it for accuracy.

// ── Types ────────────────────────────────────────────────────────────

/** A table recognized by OCR */
export interface OcrTable {
  headers: string[];
  rows: string[][];
  sourceText: string; // The raw markdown/text representation
}

/** A paragraph of text recognized by OCR */
export interface OcrParagraph {
  text: string;
  type: "text" | "heading" | "note";
}

/** Normalized OCR result for a single page */
export interface OcrResult {
  fullText: string;
  tables: OcrTable[];
  paragraphs: OcrParagraph[];
  source: "mathpix" | "none";
  confidence: number; // 0-1, how reliable the OCR output is
  processingTimeMs: number;
}

// ── Configuration ────────────────────────────────────────────────────

// Mathpix PDF processing timeout (ms). Single pages usually finish in 3-10s.
const MATHPIX_TIMEOUT_MS = 30_000;

// How often to poll Mathpix for PDF processing status
const MATHPIX_POLL_INTERVAL_MS = 1_500;

// ── Mathpix OCR API ─────────────────────────────────────────────────

/**
 * Send a single-page PDF to Mathpix for OCR.
 * Uses the /v3/pdf endpoint (async) — uploads, polls, retrieves results.
 * Returns structured text including tables in Mathpix Markdown format.
 */
async function callMathpixOcr(pdfBase64: string): Promise<{
  text: string;
  confidence: number;
}> {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("Mathpix credentials not configured (MATHPIX_APP_ID, MATHPIX_APP_KEY)");
  }

  // Step 1: Upload the single-page PDF
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "page.pdf");
  formData.append(
    "options_json",
    JSON.stringify({
      conversion_formats: { md: true },
      math_inline_delimiters: ["$", "$"],
      rm_spaces: true,
      enable_tables_fallback: true,
    })
  );

  const uploadResponse = await fetch("https://api.mathpix.com/v3/pdf", {
    method: "POST",
    headers: {
      app_id: appId,
      app_key: appKey,
    },
    body: formData,
    signal: AbortSignal.timeout(MATHPIX_TIMEOUT_MS),
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text().catch(() => "");
    throw new Error(`Mathpix upload failed (${uploadResponse.status}): ${errText.slice(0, 200)}`);
  }

  const { pdf_id } = (await uploadResponse.json()) as { pdf_id: string };

  // Step 2: Poll until processing completes
  const startTime = Date.now();
  while (Date.now() - startTime < MATHPIX_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, MATHPIX_POLL_INTERVAL_MS));

    const statusResponse = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
      headers: { app_id: appId, app_key: appKey },
      signal: AbortSignal.timeout(10_000),
    });

    if (!statusResponse.ok) continue;

    const status = (await statusResponse.json()) as {
      status: string;
      confidence?: number;
    };

    if (status.status === "completed") {
      // Step 3: Retrieve the markdown result
      const mdResponse = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.md`, {
        headers: { app_id: appId, app_key: appKey },
        signal: AbortSignal.timeout(10_000),
      });

      const mdText = mdResponse.ok ? await mdResponse.text() : "";

      return {
        text: mdText,
        confidence: status.confidence ?? 0.8,
      };
    }

    if (status.status === "error") {
      throw new Error("Mathpix processing failed");
    }
  }

  throw new Error(`Mathpix timeout after ${MATHPIX_TIMEOUT_MS}ms`);
}

// ── Table Parsing ────────────────────────────────────────────────────

/**
 * Parse markdown tables from Mathpix output.
 * Mathpix outputs tables as pipe-delimited markdown:
 *   | Col A | Col B |
 *   |-------|-------|
 *   | val1  | val2  |
 */
function parseMarkdownTables(text: string): OcrTable[] {
  const tables: OcrTable[] = [];
  const lines = text.split("\n");

  let tableLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableLine = line.startsWith("|") && line.endsWith("|");

    if (isTableLine) {
      tableLines.push(line);
    } else {
      if (tableLines.length >= 2) {
        const table = parseOneMarkdownTable(tableLines);
        if (table) tables.push(table);
      }
      tableLines = [];
    }
  }

  // Handle table at end of text
  if (tableLines.length >= 2) {
    const table = parseOneMarkdownTable(tableLines);
    if (table) tables.push(table);
  }

  return tables;
}

/**
 * Parse a single markdown table from pipe-delimited lines.
 */
function parseOneMarkdownTable(lines: string[]): OcrTable | null {
  const parseLine = (line: string): string[] =>
    line
      .split("|")
      .slice(1, -1) // Remove leading/trailing empty strings
      .map((cell) => cell.trim());

  const headerCells = parseLine(lines[0]);
  if (headerCells.length === 0) return null;

  // Second line might be a separator (|---|---|)
  let dataStartIndex = 1;
  if (lines.length > 1 && /^\|[\s\-:]+\|/.test(lines[1].trim())) {
    dataStartIndex = 2;
  }

  const rows: string[][] = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    // Skip separator lines mid-table
    if (cells.every((c) => /^[\-:]+$/.test(c) || c === "")) continue;
    rows.push(cells);
  }

  return {
    headers: headerCells,
    rows,
    sourceText: lines.join("\n"),
  };
}

/**
 * Extract paragraphs (non-table text) from OCR output.
 */
function extractParagraphs(text: string): OcrParagraph[] {
  const paragraphs: OcrParagraph[] = [];
  const lines = text.split("\n");
  let currentParagraph = "";
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (currentParagraph.trim()) {
        paragraphs.push(classifyParagraph(currentParagraph.trim()));
        currentParagraph = "";
      }
      inTable = true;
      continue;
    }

    if (inTable && /^[\-:|\s]+$/.test(trimmed)) continue;
    inTable = false;

    if (!trimmed) {
      if (currentParagraph.trim()) {
        paragraphs.push(classifyParagraph(currentParagraph.trim()));
        currentParagraph = "";
      }
      continue;
    }

    currentParagraph += (currentParagraph ? " " : "") + trimmed;
  }

  if (currentParagraph.trim()) {
    paragraphs.push(classifyParagraph(currentParagraph.trim()));
  }

  return paragraphs;
}

function classifyParagraph(text: string): OcrParagraph {
  if (text.startsWith("#") || (text.length < 80 && text === text.toUpperCase() && /[A-Z]/.test(text))) {
    return { text: text.replace(/^#+\s*/, ""), type: "heading" };
  }
  if (/^(NOTE|WARNING|CAUTION|IMPORTANT)[:\s]/i.test(text)) {
    return { text, type: "note" };
  }
  return { text, type: "text" };
}

// ── Main OCR Function ────────────────────────────────────────────────

/**
 * Run Mathpix OCR on a single PDF page (as base64).
 * Returns normalized OCR result with fullText, tables, and paragraphs.
 *
 * If Mathpix fails, returns a "none" result — extraction continues
 * with image-only (graceful degradation).
 */
export async function ocrPage(pdfBase64: string): Promise<OcrResult> {
  const startTime = Date.now();

  try {
    const mathpixResult = await callMathpixOcr(pdfBase64);

    const tables = parseMarkdownTables(mathpixResult.text);
    const paragraphs = extractParagraphs(mathpixResult.text);

    console.log(
      `[OCR] Mathpix: ${mathpixResult.text.length} chars, ${tables.length} tables, ` +
        `confidence: ${mathpixResult.confidence.toFixed(2)}, ` +
        `time: ${Date.now() - startTime}ms`
    );

    return {
      fullText: mathpixResult.text,
      tables,
      paragraphs,
      source: "mathpix",
      confidence: mathpixResult.confidence,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn("[OCR] Mathpix failed:", err instanceof Error ? err.message : err);
  }

  // Mathpix failed — return empty result (graceful degradation)
  console.warn("[OCR] OCR failed — falling back to image-only extraction");

  return {
    fullText: "",
    tables: [],
    paragraphs: [],
    source: "none",
    confidence: 0,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Format OCR result as text suitable for injection into the LLM prompt.
 */
export function formatOcrForPrompt(ocr: OcrResult): string {
  if (ocr.source === "none" || !ocr.fullText) return "";

  const sections: string[] = [];

  sections.push("=== OCR TEXT (extracted from this page) ===");
  sections.push(`Source: Mathpix OCR (confidence: ${ocr.confidence.toFixed(2)})`);
  sections.push("");

  // Full text for general context
  sections.push("FULL TEXT:");
  sections.push(ocr.fullText);
  sections.push("");

  // Highlight tables so the LLM pays extra attention
  if (ocr.tables.length > 0) {
    sections.push(`STRUCTURED TABLES (${ocr.tables.length} found):`);
    for (let i = 0; i < ocr.tables.length; i++) {
      const table = ocr.tables[i];
      sections.push(`\nTable ${i + 1}:`);
      sections.push(`Headers: ${table.headers.join(" | ")}`);
      for (const row of table.rows) {
        sections.push(`  ${row.join(" | ")}`);
      }
    }
    sections.push("");
  }

  sections.push("=== END OCR TEXT ===");

  return sections.join("\n");
}
