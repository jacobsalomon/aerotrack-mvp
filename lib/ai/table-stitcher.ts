// Multi-page table stitcher for CMM extraction.
// When a data table spans multiple consecutive pages, this module merges
// them into one logical table before sending to the LLM. This ensures:
// 1. No rows are lost at page boundaries
// 2. Column headers from page 1 propagate to continuation pages (so units carry forward)
// 3. The LLM sees the complete table in one prompt instead of fragments
//
// This is pure deterministic logic — no LLM calls.

import type { OcrResult, OcrTable } from "./ocr-service";

// ── Types ────────────────────────────────────────────────────────────

/** Table metadata from Pass 1 classification */
export interface PageTableInfo {
  pageIndex: number;
  hasHeaders: boolean;
  estimatedRows: number;
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
}

/** A stitched table spanning multiple pages */
export interface StitchedTable {
  headers: string[];
  rows: StitchedRow[];
  sourcePages: number[]; // Page indices that contributed to this table
  stitchConfidence: "high" | "medium" | "ambiguous";
  notes: string[];
}

/** A row with its source page for traceability */
export interface StitchedRow {
  cells: string[];
  sourcePageIndex: number;
}

/** Result of the stitching process for a group of pages */
export interface StitchResult {
  stitchedTables: StitchedTable[];
  /** Formatted text to replace individual page OCR in the LLM prompt */
  stitchedPromptText: string;
}

// ── Continuation Detection ───────────────────────────────────────────

/**
 * Determine if two consecutive pages' tables should be stitched together.
 * Uses multiple deterministic signals — no LLM needed.
 */
function shouldStitchTables(
  prevTable: OcrTable,
  nextTable: OcrTable,
  prevPageInfo?: PageTableInfo,
  nextPageInfo?: PageTableInfo
): { shouldStitch: boolean; confidence: "high" | "medium" | "ambiguous"; reason: string } {
  const signals: string[] = [];
  let score = 0;

  // Signal 1: Pass 1 classified them as continuation (strongest signal)
  if (prevPageInfo?.continuesToNext && nextPageInfo?.continuesFromPrevious) {
    score += 3;
    signals.push("Pass 1 flagged as continuation");
  } else if (prevPageInfo?.continuesToNext || nextPageInfo?.continuesFromPrevious) {
    score += 2;
    signals.push("Partial continuation flag from Pass 1");
  }

  // Signal 2: Column count matches
  if (prevTable.headers.length > 0 && nextTable.headers.length > 0) {
    if (prevTable.headers.length === nextTable.headers.length) {
      score += 2;
      signals.push(`Matching column count (${prevTable.headers.length})`);
    }
  } else if (prevTable.rows.length > 0 && nextTable.rows.length > 0) {
    const prevCols = prevTable.rows[0].length;
    const nextCols = nextTable.rows[0].length;
    if (prevCols === nextCols) {
      score += 1;
      signals.push(`Matching row width (${prevCols} columns)`);
    }
  }

  // Signal 3: Headers match (repeated headers on continuation page)
  if (prevTable.headers.length > 0 && nextTable.headers.length > 0) {
    const prevNormalized = prevTable.headers.map((h) => h.toLowerCase().trim());
    const nextNormalized = nextTable.headers.map((h) => h.toLowerCase().trim());
    const headersMatch = prevNormalized.length === nextNormalized.length &&
      prevNormalized.every((h, i) => h === nextNormalized[i]);

    if (headersMatch) {
      score += 3;
      signals.push("Identical headers (continuation page repeats headers)");
    }
  }

  // Signal 4: "continued" text in the OCR source
  const continuedPattern = /\b(continued|cont['']?d|cont\.)\b/i;
  if (continuedPattern.test(nextTable.sourceText)) {
    score += 2;
    signals.push("'Continued' text detected");
  }

  // Determine confidence based on accumulated signals
  if (score >= 4) {
    return { shouldStitch: true, confidence: "high", reason: signals.join("; ") };
  } else if (score >= 2) {
    return { shouldStitch: true, confidence: "medium", reason: signals.join("; ") };
  } else if (score >= 1) {
    return { shouldStitch: true, confidence: "ambiguous", reason: signals.join("; ") };
  }

  return { shouldStitch: false, confidence: "ambiguous", reason: "No continuation signals found" };
}

// ── Core Stitching ───────────────────────────────────────────────────

/**
 * Stitch tables across consecutive data_table pages.
 *
 * Input: an ordered array of page OCR results with their page indices and
 * optional Pass 1 table metadata.
 *
 * Output: stitched tables with headers propagated from the first page,
 * plus formatted text for LLM prompt injection.
 */
export function stitchTables(
  pages: Array<{
    pageIndex: number;
    ocr: OcrResult;
    tableInfo?: PageTableInfo;
  }>
): StitchResult {
  if (pages.length === 0) {
    return { stitchedTables: [], stitchedPromptText: "" };
  }

  // If only one page or no tables, return as-is
  if (pages.length === 1) {
    const page = pages[0];
    if (page.ocr.tables.length === 0) {
      return { stitchedTables: [], stitchedPromptText: "" };
    }

    const table = page.ocr.tables[0]; // Use primary table
    const stitched: StitchedTable = {
      headers: table.headers,
      rows: table.rows.map((row) => ({
        cells: row,
        sourcePageIndex: page.pageIndex,
      })),
      sourcePages: [page.pageIndex],
      stitchConfidence: "high",
      notes: [],
    };

    return {
      stitchedTables: [stitched],
      stitchedPromptText: formatStitchedForPrompt([stitched]),
    };
  }

  // Multiple pages — try to stitch consecutive tables
  const stitchedTables: StitchedTable[] = [];
  let currentStitch: StitchedTable | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const primaryTable = page.ocr.tables[0]; // Use the first/largest table per page

    if (!primaryTable) {
      // Page has no tables — break any current stitch
      if (currentStitch) {
        stitchedTables.push(currentStitch);
        currentStitch = null;
      }
      continue;
    }

    if (!currentStitch) {
      // Start a new stitch group
      currentStitch = {
        headers: primaryTable.headers,
        rows: primaryTable.rows.map((row) => ({
          cells: row,
          sourcePageIndex: page.pageIndex,
        })),
        sourcePages: [page.pageIndex],
        stitchConfidence: "high",
        notes: [],
      };
      continue;
    }

    // Check if this page's table continues from the previous
    const prevPage = pages[i - 1];
    const prevTable = prevPage.ocr.tables[0];

    if (!prevTable) {
      // Previous page had no table — start fresh
      stitchedTables.push(currentStitch);
      currentStitch = {
        headers: primaryTable.headers,
        rows: primaryTable.rows.map((row) => ({
          cells: row,
          sourcePageIndex: page.pageIndex,
        })),
        sourcePages: [page.pageIndex],
        stitchConfidence: "high",
        notes: [],
      };
      continue;
    }

    const stitchCheck = shouldStitchTables(
      prevTable,
      primaryTable,
      prevPage.tableInfo,
      page.tableInfo
    );

    if (stitchCheck.shouldStitch) {
      // Merge this page's rows into the current stitch
      // Skip rows that are repeated headers on the continuation page
      const rowsToAdd = primaryTable.headers.length > 0 &&
        currentStitch.headers.length > 0
        ? primaryTable.rows // Headers are separate, all rows are data
        : primaryTable.rows;

      for (const row of rowsToAdd) {
        currentStitch.rows.push({
          cells: row,
          sourcePageIndex: page.pageIndex,
        });
      }

      currentStitch.sourcePages.push(page.pageIndex);

      // Downgrade confidence if this stitch was ambiguous
      if (stitchCheck.confidence === "ambiguous") {
        currentStitch.stitchConfidence = "ambiguous";
        currentStitch.notes.push(
          `Page ${page.pageIndex + 1}: ambiguous continuation — ${stitchCheck.reason}`
        );
      } else if (stitchCheck.confidence === "medium" && currentStitch.stitchConfidence === "high") {
        currentStitch.stitchConfidence = "medium";
      }
    } else {
      // Not a continuation — close current stitch and start new one
      stitchedTables.push(currentStitch);
      currentStitch = {
        headers: primaryTable.headers,
        rows: primaryTable.rows.map((row) => ({
          cells: row,
          sourcePageIndex: page.pageIndex,
        })),
        sourcePages: [page.pageIndex],
        stitchConfidence: "high",
        notes: [],
      };
    }
  }

  // Close the last stitch group
  if (currentStitch) {
    stitchedTables.push(currentStitch);
  }

  return {
    stitchedTables,
    stitchedPromptText: formatStitchedForPrompt(stitchedTables),
  };
}

// ── Prompt Formatting ────────────────────────────────────────────────

/**
 * Format stitched tables into text suitable for LLM prompt injection.
 * Replaces individual page OCR text with the unified table view.
 */
function formatStitchedForPrompt(tables: StitchedTable[]): string {
  if (tables.length === 0) return "";

  const sections: string[] = [];
  sections.push("=== STITCHED TABLE DATA (merged from multiple pages) ===");

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    sections.push("");
    sections.push(
      `Table ${i + 1} (pages ${table.sourcePages.map((p) => p + 1).join(", ")}, ` +
        `confidence: ${table.stitchConfidence}):`
    );

    // Header row
    if (table.headers.length > 0) {
      sections.push(`Headers: ${table.headers.join(" | ")}`);
    }

    // Data rows with source page annotation
    for (const row of table.rows) {
      sections.push(`  [p${row.sourcePageIndex + 1}] ${row.cells.join(" | ")}`);
    }

    // Ambiguity notes
    if (table.notes.length > 0) {
      sections.push("");
      sections.push("STITCHING NOTES (review for accuracy):");
      for (const note of table.notes) {
        sections.push(`  - ${note}`);
      }
    }
  }

  sections.push("");
  sections.push("=== END STITCHED TABLE DATA ===");

  return sections.join("\n");
}
