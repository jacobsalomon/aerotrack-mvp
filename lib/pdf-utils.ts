// Utility functions for working with PDF files.
// Uses pdf-lib (already in deps) to slice PDFs by page range —
// we send smaller page subsets to Gemini for better extraction accuracy.

import { PDFDocument } from "pdf-lib";

/**
 * Extract specific pages from a PDF and return as a new PDF buffer.
 * Page numbers are 0-indexed.
 */
export async function extractPdfPages(
  pdfBytes: Buffer | Uint8Array,
  pageIndices: number[]
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();

  // Copy only the requested pages into the new document
  const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  const newPdfBytes = await newDoc.save();
  return Buffer.from(newPdfBytes);
}

/**
 * Extract a single page from a PDF and return as base64.
 * Page number is 0-indexed.
 */
export async function extractSinglePageAsBase64(
  pdfBytes: Buffer | Uint8Array,
  pageIndex: number
): Promise<string> {
  const pageBuffer = await extractPdfPages(pdfBytes, [pageIndex]);
  return pageBuffer.toString("base64");
}

/**
 * Pre-parsed PDF handle for extracting multiple pages without re-parsing.
 * For a 500-page PDF, this avoids parsing the full document 500 times.
 */
export interface ParsedPdf {
  /** Extract a single page as a new PDF buffer */
  extractPage(pageIndex: number): Promise<Buffer>;
  /** Extract a single page as base64 */
  extractPageAsBase64(pageIndex: number): Promise<string>;
  /** Total page count */
  pageCount: number;
}

/**
 * Parse a PDF once and return a handle for efficient page extraction.
 * Call this once, then use the handle to extract individual pages.
 */
export async function parsePdf(pdfBytes: Buffer | Uint8Array): Promise<ParsedPdf> {
  const srcDoc = await PDFDocument.load(pdfBytes);

  async function extractPage(pageIndex: number): Promise<Buffer> {
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex]);
    newDoc.addPage(copiedPage);
    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  }

  return {
    pageCount: srcDoc.getPageCount(),
    extractPage,
    async extractPageAsBase64(pageIndex: number): Promise<string> {
      const buf = await extractPage(pageIndex);
      return buf.toString("base64");
    },
  };
}

/**
 * Get the total number of pages in a PDF.
 */
export async function getPdfPageCount(
  pdfBytes: Buffer | Uint8Array
): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes);
  return doc.getPageCount();
}

/**
 * Parse a page range string like "1-5, 8, 10-12" into an array of 0-indexed page numbers.
 * Input uses 1-based page numbers (what users expect).
 * Output uses 0-based indices (what pdf-lib expects).
 */
export function parsePageRanges(rangeString: string): number[] {
  const pages: Set<number> = new Set();

  const parts = rangeString.split(",").map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) continue;
      for (let i = start; i <= end; i++) {
        pages.add(i - 1); // Convert to 0-indexed
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1) {
        pages.add(page - 1); // Convert to 0-indexed
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}
