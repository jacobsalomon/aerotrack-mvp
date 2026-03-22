// OCR service for CMM extraction pipeline.
// Extracts text from PDF pages to supplement LLM image analysis.
// Two-tier approach: tries the PDF's embedded text layer first (free, instant),
// then falls back to Mathpix OCR API for scanned/image-heavy pages.

// pdfjs-dist is loaded lazily to avoid crashing the module if the import fails.
// Uses dynamic import so the rest of the OCR service (Mathpix tier) still works.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  return pdfjs;
}

// ── Types ────────────────────────────────────────────────────────────

/** A single cell in a recognized table */
export interface OcrTableCell {
  text: string;
  row: number;
  col: number;
}

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
  source: "text_layer" | "mathpix" | "none";
  confidence: number; // 0-1, how reliable the OCR output is
  processingTimeMs: number;
}

// ── Configuration ────────────────────────────────────────────────────

// Minimum characters from text layer before we consider it "good enough"
// and skip the Mathpix API call. CMM pages with tables typically have
// 200+ characters of text. Below this threshold, the text layer is likely
// incomplete (scanned image page) and we need real OCR.
const TEXT_LAYER_MIN_CHARS = 100;

// Mathpix PDF processing timeout (ms). Single pages usually finish in 3-10s.
const MATHPIX_TIMEOUT_MS = 30_000;

// How often to poll Mathpix for PDF processing status
const MATHPIX_POLL_INTERVAL_MS = 1_500;

// ── Tier 1: PDF Text Layer Extraction (pdfjs-dist) ──────────────────

/**
 * Extract text from the PDF's embedded text layer.
 * This is free and instant — no API call needed.
 * Returns empty string for scanned/image-only pages.
 */
async function extractTextLayer(pdfBase64: string): Promise<string> {
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  const uint8 = new Uint8Array(pdfBytes);

  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false }).promise;
  const page = await doc.getPage(1); // Single-page PDF, always page 1
  const textContent = await page.getTextContent();

  // Reconstruct text with approximate layout preservation
  const items = textContent.items as Array<{
    str: string;
    transform: number[];
    hasEOL?: boolean;
  }>;

  if (items.length === 0) return "";

  // Sort by vertical position (descending Y = top of page first),
  // then horizontal position (ascending X = left to right)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5]; // Y descending
    if (Math.abs(yDiff) > 3) return yDiff; // Different lines
    return a.transform[4] - b.transform[4]; // Same line: X ascending
  });

  let text = "";
  let lastY: number | null = null;

  for (const item of sorted) {
    const y = Math.round(item.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 3) {
      text += "\n"; // New line when Y position changes
    } else if (lastY !== null) {
      text += " "; // Same line, add space between items
    }
    text += item.str;
    lastY = y;
  }

  return text.trim();
}

// ── Tier 2: Mathpix OCR API ─────────────────────────────────────────

/**
 * Send a single-page PDF to Mathpix for OCR.
 * Uses the /v3/pdf endpoint (async) — uploads, polls, retrieves results.
 * Returns structured text including tables.
 */
async function callMathpixOcr(pdfBase64: string): Promise<{
  text: string;
  confidence: number;
  linesJson?: MathpixLinesResponse;
}> {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("Mathpix credentials not configured (MATHPIX_APP_ID, MATHPIX_APP_KEY)");
  }

  // Step 1: Upload the PDF
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
      include_line_data: true,
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
      num_pages_completed?: number;
      confidence?: number;
    };

    if (status.status === "completed") {
      // Step 3: Retrieve the markdown result
      const mdResponse = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.md`, {
        headers: { app_id: appId, app_key: appKey },
        signal: AbortSignal.timeout(10_000),
      });

      const mdText = mdResponse.ok ? await mdResponse.text() : "";

      // Also try to get structured line data
      let linesJson: MathpixLinesResponse | undefined;
      try {
        const linesResponse = await fetch(
          `https://api.mathpix.com/v3/pdf/${pdf_id}.lines.json`,
          {
            headers: { app_id: appId, app_key: appKey },
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (linesResponse.ok) {
          linesJson = (await linesResponse.json()) as MathpixLinesResponse;
        }
      } catch {
        // Lines JSON is optional — markdown is sufficient
      }

      return {
        text: mdText,
        confidence: status.confidence ?? 0.8,
        linesJson,
      };
    }

    if (status.status === "error") {
      throw new Error("Mathpix processing failed");
    }
  }

  throw new Error(`Mathpix timeout after ${MATHPIX_TIMEOUT_MS}ms`);
}

// Mathpix lines.json response shape (simplified)
interface MathpixLinesResponse {
  pages: Array<{
    lines: Array<{
      type: string; // "text", "table", "equation", etc.
      text: string;
      html?: string;
      data?: Array<{ type: string; value: string }>;
    }>;
  }>;
}

// ── Table Parsing ────────────────────────────────────────────────────

/**
 * Parse markdown tables from OCR text.
 * Mathpix outputs tables as pipe-delimited markdown.
 * Example:
 *   | Col A | Col B |
 *   |-------|-------|
 *   | val1  | val2  |
 */
function parseMarkdownTables(text: string): OcrTable[] {
  const tables: OcrTable[] = [];
  const lines = text.split("\n");

  let tableStart = -1;
  let tableLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableLine = line.startsWith("|") && line.endsWith("|");

    if (isTableLine) {
      if (tableStart === -1) tableStart = i;
      tableLines.push(line);
    } else {
      if (tableLines.length >= 2) {
        // We found a complete table
        const table = parseOneMarkdownTable(tableLines);
        if (table) tables.push(table);
      }
      tableStart = -1;
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
 * Parse a single markdown table from an array of pipe-delimited lines.
 */
function parseOneMarkdownTable(lines: string[]): OcrTable | null {
  // Split each line into cells
  const parseLine = (line: string): string[] =>
    line
      .split("|")
      .slice(1, -1) // Remove leading and trailing empty strings from split
      .map((cell) => cell.trim());

  // First line is usually headers
  const headerCells = parseLine(lines[0]);
  if (headerCells.length === 0) return null;

  // Second line might be a separator (|---|---|)
  let dataStartIndex = 1;
  if (lines.length > 1) {
    const secondLine = lines[1].trim();
    const isSeparator = /^\|[\s\-:]+\|/.test(secondLine);
    if (isSeparator) dataStartIndex = 2;
  }

  // Parse data rows
  const rows: string[][] = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    // Skip separator lines that might appear mid-table
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

    // Skip table lines
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (currentParagraph.trim()) {
        paragraphs.push(classifyParagraph(currentParagraph.trim()));
        currentParagraph = "";
      }
      inTable = true;
      continue;
    }

    // Skip separator lines after tables
    if (inTable && /^[\-:|\s]+$/.test(trimmed)) continue;
    inTable = false;

    // Blank line = paragraph break
    if (!trimmed) {
      if (currentParagraph.trim()) {
        paragraphs.push(classifyParagraph(currentParagraph.trim()));
        currentParagraph = "";
      }
      continue;
    }

    currentParagraph += (currentParagraph ? " " : "") + trimmed;
  }

  // Final paragraph
  if (currentParagraph.trim()) {
    paragraphs.push(classifyParagraph(currentParagraph.trim()));
  }

  return paragraphs;
}

function classifyParagraph(text: string): OcrParagraph {
  // Detect headings (all caps, short, or starts with #)
  if (text.startsWith("#") || (text.length < 80 && text === text.toUpperCase() && /[A-Z]/.test(text))) {
    return { text: text.replace(/^#+\s*/, ""), type: "heading" };
  }
  // Detect notes/warnings/cautions
  if (/^(NOTE|WARNING|CAUTION|IMPORTANT)[:\s]/i.test(text)) {
    return { text, type: "note" };
  }
  return { text, type: "text" };
}

// ── Main OCR Function ────────────────────────────────────────────────

/**
 * Run OCR on a single PDF page (as base64).
 * Two-tier approach:
 *   1. Extract embedded text layer from PDF (free, instant)
 *   2. If text layer is sparse, call Mathpix OCR API (paid, ~5-10s)
 * Returns normalized OCR result with fullText, tables, and paragraphs.
 *
 * If everything fails, returns a "none" result — extraction continues
 * with image-only (graceful degradation).
 */
export async function ocrPage(pdfBase64: string): Promise<OcrResult> {
  const startTime = Date.now();

  // Tier 1: Try the PDF text layer first (free and instant)
  try {
    const textLayerText = await extractTextLayer(pdfBase64);

    if (textLayerText.length >= TEXT_LAYER_MIN_CHARS) {
      const tables = parseMarkdownTables(textLayerText);
      const paragraphs = extractParagraphs(textLayerText);

      console.log(
        `[OCR] Text layer: ${textLayerText.length} chars, ${tables.length} tables — using text layer`
      );

      return {
        fullText: textLayerText,
        tables,
        paragraphs,
        source: "text_layer",
        confidence: 0.85, // Text layer is accurate but may miss visual elements
        processingTimeMs: Date.now() - startTime,
      };
    }

    if (textLayerText.length > 0) {
      console.log(
        `[OCR] Text layer sparse (${textLayerText.length} chars < ${TEXT_LAYER_MIN_CHARS}) — trying Mathpix`
      );
    }
  } catch (err) {
    console.warn("[OCR] Text layer extraction failed:", err instanceof Error ? err.message : err);
  }

  // Tier 2: Call Mathpix OCR (paid API, more thorough)
  try {
    const mathpixResult = await callMathpixOcr(pdfBase64);

    const tables = parseMarkdownTables(mathpixResult.text);
    const paragraphs = extractParagraphs(mathpixResult.text);

    console.log(
      `[OCR] Mathpix: ${mathpixResult.text.length} chars, ${tables.length} tables, ` +
        `confidence: ${mathpixResult.confidence.toFixed(2)}`
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

  // Both tiers failed — return empty result (graceful degradation)
  console.warn("[OCR] All OCR methods failed — falling back to image-only extraction");

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
 * Produces a clean, structured text representation that helps the LLM
 * cross-reference what it sees in the image.
 */
export function formatOcrForPrompt(ocr: OcrResult): string {
  if (ocr.source === "none" || !ocr.fullText) return "";

  const sections: string[] = [];

  sections.push("=== OCR TEXT (extracted from this page) ===");
  sections.push(`Source: ${ocr.source} (confidence: ${ocr.confidence.toFixed(2)})`);
  sections.push("");

  // Include full text for general context
  sections.push("FULL TEXT:");
  sections.push(ocr.fullText);
  sections.push("");

  // Highlight tables explicitly so the LLM pays attention to them
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
