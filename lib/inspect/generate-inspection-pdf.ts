// Generate a professional PDF inspection report from a completed guided inspection.
// Uses pdf-lib (already in deps). Called by the generate-report API endpoint.
// Layout: header → summary → section tables → findings → photo appendix → sign-off footer.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";

// ── Page constants (US Letter) ──
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Colors ──
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92);
const DARK_BLUE = rgb(0.1, 0.15, 0.35);
const RED = rgb(0.8, 0.15, 0.15);
const GREEN = rgb(0.15, 0.55, 0.15);

// ── Types for the data we need (kept minimal — mirrors what the API endpoint loads) ──

export interface PdfInspectionItem {
  id: string;
  itemCallout: string | null;
  parameterName: string;
  specification: string;
  specUnit: string | null;
  specValueLow: number | null;
  specValueHigh: number | null;
  itemType: string;
  instanceCount: number;
  instanceLabels: string[];
  notes: string | null;
}

export interface PdfInspectionSection {
  id: string;
  title: string;
  figureNumber: string;
  items: PdfInspectionItem[];
}

export interface PdfProgressRecord {
  inspectionItemId: string;
  instanceIndex: number;
  status: string;
  result: string | null;
  notes: string | null;
  measurement: {
    value: number;
    unit: string;
    inTolerance: boolean | null;
  } | null;
}

export interface PdfFinding {
  description: string;
  severity: string;
  status: string;
  inspectionItemId: string | null;
  inspectionItem: { parameterName: string; itemCallout: string | null } | null;
  inspectionSection: { title: string; figureNumber: string } | null;
  photoUrls: string[];
  createdBy: { firstName: string | null; name: string | null } | null;
}

export interface PdfPhoto {
  fileUrl: string;
  inspectionItemId: string | null;
  instanceIndex: number | null;
  inspectionItem: { parameterName: string; itemCallout: string | null } | null;
}

export interface PdfSessionData {
  workOrderRef: string | null;
  startedAt: string;
  signedOffAt: string | null;
  signOffNotes: string | null;
  cmmRevisionAcknowledgedAt: string | null;
  organization: { name: string } | null;
  user: { firstName: string | null; lastName: string | null; name: string | null; badgeNumber: string | null } | null;
  signedOffBy: { firstName: string | null; lastName: string | null; name: string | null } | null;
  component: { partNumber: string; serialNumber: string; description: string } | null;
  template: {
    title: string;
    revisionDate: string | null;
    sections: PdfInspectionSection[];
  } | null;
  progress: PdfProgressRecord[];
  findings: PdfFinding[];
  photos: PdfPhoto[];
}

// ── Main export ──────────────────────────────────────

export async function generateInspectionPdf(data: PdfSessionData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Build a progress lookup: key = "itemId:instanceIndex"
  const progressMap = new Map<string, PdfProgressRecord>();
  for (const p of data.progress) {
    progressMap.set(`${p.inspectionItemId}:${p.instanceIndex}`, p);
  }

  // ── Page management ──
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function needSpace(amount: number) {
    if (y - amount < MARGIN + 30) {
      drawPageFooter(page, font, pdf.getPageCount());
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  // ═══ HEADER ═══
  y = drawHeader(page, font, fontBold, data, y);

  // ═══ SUMMARY ═══
  y = drawSummary(page, font, fontBold, data, y);

  // ═══ SECTION TABLES ═══
  const sections = data.template?.sections || [];
  for (const section of sections) {
    // Section header
    needSpace(50);
    y = drawSectionHeader(page, fontBold, section, y);

    // Column headers
    needSpace(20);
    y = drawTableHeader(page, font, y);

    // Items (expand multi-instance)
    for (const item of section.items) {
      const instances = item.instanceCount > 1 ? item.instanceCount : 1;
      for (let inst = 0; inst < instances; inst++) {
        needSpace(30);
        const key = `${item.id}:${inst}`;
        const prog = progressMap.get(key);
        y = drawItemRow(page, font, fontBold, item, inst, instances, prog, y);
      }
    }

    y -= 8; // spacing between sections
  }

  // ═══ FINDINGS ═══
  if (data.findings.length > 0) {
    needSpace(40);
    y = drawFindingsSection(page, font, fontBold, data.findings, y, () => {
      needSpace(40);
      return y;
    });
  }

  // ═══ PHOTO APPENDIX ═══
  if (data.photos.length > 0) {
    needSpace(40);
    y = await drawPhotoAppendix(pdf, page, font, fontBold, data.photos, y, () => {
      drawPageFooter(page, font, pdf.getPageCount());
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      return { page, y };
    });
  }

  // ═══ SIGN-OFF ═══
  needSpace(60);
  y = drawSignOff(page, font, fontBold, data, y);

  // Final page footer
  drawPageFooter(page, font, pdf.getPageCount());

  return pdf.save();
}

// ══════════════════════════════════════════════════════
// Drawing helpers
// ══════════════════════════════════════════════════════

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  data: PdfSessionData,
  startY: number
): number {
  let y = startY;

  // Title bar
  page.drawRectangle({
    x: MARGIN, y: y - 28, width: CONTENT_W, height: 32,
    color: DARK_BLUE,
  });
  page.drawText("INSPECTION REPORT", {
    x: MARGIN + 12, y: y - 20, size: 16, font: fontBold, color: rgb(1, 1, 1),
  });
  y -= 40;

  // Info grid — two columns
  const col1 = MARGIN + 5;
  const col2 = MARGIN + CONTENT_W / 2;

  const orgName = data.organization?.name || "—";
  const wo = data.workOrderRef || "—";
  const pn = data.component?.partNumber || "—";
  const sn = data.component?.serialNumber || "—";
  const desc = data.component?.description || "";
  const cmmTitle = data.template?.title || "—";
  const cmmRev = data.template?.revisionDate
    ? new Date(data.template.revisionDate).toLocaleDateString()
    : "—";
  const inspector = formatName(data.user);
  const badge = data.user?.badgeNumber || "—";
  const dateStr = data.signedOffAt
    ? new Date(data.signedOffAt).toLocaleDateString()
    : new Date(data.startedAt).toLocaleDateString();

  // Left column
  y = drawField(page, font, fontBold, "Company", orgName, col1, y);
  y = drawField(page, font, fontBold, "WO#", wo, col1, y);
  y = drawField(page, font, fontBold, "Part Number", pn, col1, y);
  if (desc) {
    y = drawField(page, font, fontBold, "Description", desc, col1, y);
  }

  // Right column (reset y to same start)
  let y2 = startY - 40;
  y2 = drawField(page, font, fontBold, "Serial Number", sn, col2, y2);
  y2 = drawField(page, font, fontBold, "CMM", cmmTitle, col2, y2);
  y2 = drawField(page, font, fontBold, "CMM Rev Date", cmmRev, col2, y2);
  y2 = drawField(page, font, fontBold, "Inspector", `${inspector} (Badge: ${badge})`, col2, y2);
  y2 = drawField(page, font, fontBold, "Date", dateStr, col2, y2);

  y = Math.min(y, y2) - 5;

  // Divider
  drawHorizontalLine(page, y);
  y -= 8;

  return y;
}

function drawSummary(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  data: PdfSessionData,
  startY: number
): number {
  let y = startY;

  page.drawText("SUMMARY", { x: MARGIN + 5, y, size: 11, font: fontBold, color: DARK_BLUE });
  y -= 16;

  const total = data.progress.length;
  const done = data.progress.filter(p => p.status === "done").length;
  const problems = data.progress.filter(p => p.status === "problem").length;
  const skipped = data.progress.filter(p => p.status === "skipped").length;
  const findingsCount = data.findings.length;
  const photoCount = data.photos.length;

  const summaryText = [
    `Total items: ${total}`,
    `Completed: ${done}`,
    `Problems: ${problems}`,
    `Skipped: ${skipped}`,
    `Findings: ${findingsCount}`,
    `Photos: ${photoCount}`,
  ].join("    ");

  page.drawText(summaryText, { x: MARGIN + 5, y, size: 9, font, color: BLACK });
  y -= 14;

  if (data.cmmRevisionAcknowledgedAt) {
    const ackDate = new Date(data.cmmRevisionAcknowledgedAt).toLocaleDateString();
    page.drawText(`CMM revision confirmed: ${ackDate}`, {
      x: MARGIN + 5, y, size: 8, font, color: GRAY,
    });
    y -= 12;
  }

  // Sign-off status line
  if (data.signedOffAt) {
    const signedBy = formatName(data.signedOffBy);
    const signedDate = new Date(data.signedOffAt).toLocaleString();
    page.drawText(`Signed off by ${signedBy} on ${signedDate}`, {
      x: MARGIN + 5, y, size: 8, font: fontBold, color: GREEN,
    });
    y -= 12;
  }

  drawHorizontalLine(page, y);
  y -= 10;

  return y;
}

function drawSectionHeader(
  page: PDFPage,
  fontBold: PDFFont,
  section: PdfInspectionSection,
  startY: number
): number {
  let y = startY;

  // Section header bar
  page.drawRectangle({
    x: MARGIN, y: y - 14, width: CONTENT_W, height: 18, color: LIGHT_GRAY,
  });
  page.drawText(`Fig ${section.figureNumber} — ${section.title}`, {
    x: MARGIN + 8, y: y - 10, size: 9, font: fontBold, color: DARK_BLUE,
  });
  y -= 22;

  return y;
}

// Table column positions
const COL_CALLOUT = MARGIN + 5;
const COL_ITEM = MARGIN + 45;
const COL_SPEC = MARGIN + 230;
const COL_RESULT = MARGIN + 370;
const COL_STATUS = MARGIN + 460;

function drawTableHeader(page: PDFPage, font: PDFFont, startY: number): number {
  let y = startY;
  const size = 7;
  const color = GRAY;

  page.drawText("#", { x: COL_CALLOUT, y, size, font, color });
  page.drawText("Item", { x: COL_ITEM, y, size, font, color });
  page.drawText("Specification", { x: COL_SPEC, y, size, font, color });
  page.drawText("Result", { x: COL_RESULT, y, size, font, color });
  page.drawText("Status", { x: COL_STATUS, y, size, font, color });

  y -= 4;
  drawHorizontalLine(page, y, 0.3);
  y -= 8;

  return y;
}

function drawItemRow(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  item: PdfInspectionItem,
  instanceIndex: number,
  totalInstances: number,
  prog: PdfProgressRecord | undefined,
  startY: number
): number {
  let y = startY;
  const size = 8;

  // Callout number
  const callout = item.itemCallout || "—";
  page.drawText(callout, { x: COL_CALLOUT, y, size, font, color: BLACK });

  // Parameter name (with instance label if multi)
  let paramName = item.parameterName;
  if (totalInstances > 1) {
    const label = item.instanceLabels?.[instanceIndex] || `#${instanceIndex + 1}`;
    paramName = `${paramName} (${label})`;
  }
  // Truncate long names to fit column
  const maxNameWidth = COL_SPEC - COL_ITEM - 10;
  paramName = truncateText(paramName, font, size, maxNameWidth);
  page.drawText(paramName, { x: COL_ITEM, y, size, font, color: BLACK });

  // Specification
  const specText = formatSpec(item);
  const maxSpecWidth = COL_RESULT - COL_SPEC - 10;
  const truncSpec = truncateText(specText, font, size, maxSpecWidth);
  page.drawText(truncSpec, { x: COL_SPEC, y, size, font, color: GRAY });

  // Result (measured value + unit)
  if (prog?.measurement) {
    const m = prog.measurement;
    const resultText = `${m.value} ${m.unit}`;
    const resultColor = m.inTolerance === false ? RED : BLACK;
    page.drawText(resultText, { x: COL_RESULT, y, size, font: fontBold, color: resultColor });
  } else if (prog?.status === "done") {
    page.drawText("PASS", { x: COL_RESULT, y, size, font: fontBold, color: GREEN });
  } else if (prog?.status === "skipped") {
    page.drawText("SKIPPED", { x: COL_RESULT, y, size, font, color: GRAY });
  } else {
    page.drawText("—", { x: COL_RESULT, y, size, font, color: GRAY });
  }

  // Status icon/text
  const statusText = formatStatus(prog);
  const statusColor = prog?.status === "problem" ? RED
    : prog?.status === "done" ? GREEN
    : GRAY;
  page.drawText(statusText, { x: COL_STATUS, y, size, font: fontBold, color: statusColor });

  y -= 14;

  // If there are notes on this progress record, show them indented
  if (prog?.notes) {
    const noteText = `Note: ${prog.notes}`;
    const wrappedY = drawWrappedText(page, noteText, COL_ITEM, y, CONTENT_W - 50, font, 7, GRAY);
    y = wrappedY - 4;
  }

  return y;
}

function drawFindingsSection(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  findings: PdfFinding[],
  startY: number,
  requestSpace: () => number
): number {
  let y = startY;

  // Section title
  page.drawRectangle({
    x: MARGIN, y: y - 14, width: CONTENT_W, height: 18, color: rgb(1, 0.92, 0.92),
  });
  page.drawText("FINDINGS", {
    x: MARGIN + 8, y: y - 10, size: 10, font: fontBold, color: RED,
  });
  y -= 26;

  for (const f of findings) {
    // Each finding needs ~30px
    if (y < MARGIN + 60) {
      y = requestSpace();
    }

    const itemRef = f.inspectionItem?.itemCallout
      ? `#${f.inspectionItem.itemCallout} `
      : "";
    const sectionRef = f.inspectionSection
      ? `(Fig ${f.inspectionSection.figureNumber}) `
      : "";
    const paramRef = f.inspectionItem?.parameterName || "";

    // Severity badge
    const sevColor = f.severity === "critical" ? RED : f.severity === "major" ? rgb(0.8, 0.5, 0) : GRAY;
    page.drawText(f.severity.toUpperCase(), {
      x: MARGIN + 5, y, size: 7, font: fontBold, color: sevColor,
    });

    // Finding description
    const desc = `${itemRef}${paramRef} ${sectionRef}— ${f.description}`;
    const wrappedY = drawWrappedText(page, desc, MARGIN + 55, y, CONTENT_W - 60, font, 8, BLACK);
    y = wrappedY - 6;

    // Status + reporter
    const reporter = f.createdBy ? formatName(f.createdBy) : "—";
    page.drawText(`Status: ${f.status} · Reported by: ${reporter}`, {
      x: MARGIN + 55, y, size: 7, font, color: GRAY,
    });
    y -= 14;
  }

  return y;
}

async function drawPhotoAppendix(
  pdf: PDFDocument,
  currentPage: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  photos: PdfPhoto[],
  startY: number,
  newPage: () => { page: PDFPage; y: number }
): Promise<number> {
  let page = currentPage;
  let y = startY;

  // Section title
  page.drawRectangle({
    x: MARGIN, y: y - 14, width: CONTENT_W, height: 18, color: LIGHT_GRAY,
  });
  page.drawText("PHOTO APPENDIX", {
    x: MARGIN + 8, y: y - 10, size: 10, font: fontBold, color: DARK_BLUE,
  });
  y -= 30;

  // Fetch and embed photos — do them in parallel batches for speed
  const THUMB_W = 80;
  const THUMB_H = 60;
  const PHOTOS_PER_ROW = 5;
  const ROW_HEIGHT = THUMB_H + 24; // thumbnail + label space

  // Fetch all photo bytes in parallel (with a concurrency limit)
  const photoImages = await fetchPhotoImages(pdf, photos);

  let colIndex = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const image = photoImages[i];

    // Need new page?
    if (y - ROW_HEIGHT < MARGIN + 30) {
      drawPageFooter(page, font, pdf.getPageCount());
      const np = newPage();
      page = np.page;
      y = np.y;
      colIndex = 0;
    }

    const x = MARGIN + colIndex * (THUMB_W + 16);

    // Draw thumbnail (if we got the image)
    if (image) {
      try {
        page.drawImage(image, {
          x, y: y - THUMB_H, width: THUMB_W, height: THUMB_H,
        });
      } catch {
        // If image draw fails, draw a placeholder
        page.drawRectangle({
          x, y: y - THUMB_H, width: THUMB_W, height: THUMB_H,
          color: LIGHT_GRAY,
        });
        page.drawText("N/A", { x: x + 30, y: y - 35, size: 8, font, color: GRAY });
      }
    } else {
      // Placeholder for failed fetch
      page.drawRectangle({
        x, y: y - THUMB_H, width: THUMB_W, height: THUMB_H,
        color: LIGHT_GRAY,
      });
      page.drawText("N/A", { x: x + 30, y: y - 35, size: 8, font, color: GRAY });
    }

    // Label below thumbnail
    const label = photo.inspectionItem
      ? `${photo.inspectionItem.itemCallout ? `#${photo.inspectionItem.itemCallout} ` : ""}${photo.inspectionItem.parameterName}`
      : "General";
    const truncLabel = truncateText(label, font, 6.5, THUMB_W);
    page.drawText(truncLabel, {
      x, y: y - THUMB_H - 10, size: 6.5, font, color: GRAY,
    });

    colIndex++;
    if (colIndex >= PHOTOS_PER_ROW) {
      colIndex = 0;
      y -= ROW_HEIGHT;
    }
  }

  // If we ended mid-row, move y down
  if (colIndex > 0) {
    y -= ROW_HEIGHT;
  }

  return y;
}

function drawSignOff(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  data: PdfSessionData,
  startY: number
): number {
  let y = startY;

  drawHorizontalLine(page, y);
  y -= 15;

  page.drawText("SIGN-OFF", { x: MARGIN + 5, y, size: 10, font: fontBold, color: DARK_BLUE });
  y -= 16;

  if (data.signedOffAt) {
    const signedBy = formatName(data.signedOffBy);
    const signedDate = new Date(data.signedOffAt).toLocaleString();
    page.drawText(`Signed by: ${signedBy}`, { x: MARGIN + 5, y, size: 9, font: fontBold, color: BLACK });
    y -= 14;
    page.drawText(`Date: ${signedDate}`, { x: MARGIN + 5, y, size: 9, font, color: BLACK });
    y -= 14;
    if (data.signOffNotes) {
      page.drawText(`Notes: ${data.signOffNotes}`, { x: MARGIN + 5, y, size: 8, font, color: GRAY });
      y -= 12;
    }
  } else {
    page.drawText("Not yet signed off", { x: MARGIN + 5, y, size: 9, font, color: GRAY });
    y -= 14;
  }

  if (data.cmmRevisionAcknowledgedAt) {
    const ackDate = new Date(data.cmmRevisionAcknowledgedAt).toLocaleDateString();
    page.drawText(`CMM revision acknowledged: ${ackDate}`, {
      x: MARGIN + 5, y, size: 8, font, color: GRAY,
    });
    y -= 12;
  }

  return y;
}

function drawPageFooter(page: PDFPage, font: PDFFont, pageNum: number) {
  const y = 20;
  page.drawRectangle({
    x: MARGIN, y: y - 2, width: CONTENT_W, height: 14, color: LIGHT_GRAY,
  });
  page.drawText(
    "AeroVision Inspection Report  |  Generated by AeroVision",
    { x: MARGIN + 8, y: y + 1, size: 6.5, font, color: GRAY }
  );
  page.drawText(
    `Page ${pageNum}`,
    { x: PAGE_W - MARGIN - 40, y: y + 1, size: 6.5, font, color: GRAY }
  );
}

// ══════════════════════════════════════════════════════
// Utility helpers
// ══════════════════════════════════════════════════════

function formatName(user: { firstName: string | null; lastName?: string | null; name: string | null } | null | undefined): string {
  if (!user) return "Unknown";
  if (user.firstName) return `${user.firstName} ${user.lastName || ""}`.trim();
  return user.name || "Unknown";
}

function formatSpec(item: PdfInspectionItem): string {
  if (item.specValueLow != null && item.specValueHigh != null) {
    const unit = item.specUnit || "";
    return `${item.specValueLow}–${item.specValueHigh} ${unit}`.trim();
  }
  if (item.specification) {
    // Truncate very long spec strings
    return item.specification.length > 40
      ? item.specification.slice(0, 37) + "..."
      : item.specification;
  }
  if (item.itemType === "visual_check") return "Visual";
  if (item.itemType === "procedural_check") return "Procedural";
  return "—";
}

function formatStatus(prog: PdfProgressRecord | undefined): string {
  if (!prog) return "PENDING";
  switch (prog.status) {
    case "done":
      return prog.result === "out_of_spec" || prog.result === "fail" ? "OUT OF SPEC" : "PASS";
    case "problem":
      return "OUT OF SPEC";
    case "skipped":
      return "SKIPPED";
    default:
      return "PENDING";
  }
}

function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  textFont: PDFFont,
  fontSize: number,
  color = BLACK
): number {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = textFont.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size: fontSize, font: textFont, color });
      currentY -= fontSize + 3;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size: fontSize, font: textFont, color });
    currentY -= fontSize + 3;
  }
  return currentY;
}

function drawHorizontalLine(page: PDFPage, y: number, thickness = 0.5) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness,
    color: GRAY,
  });
}

function drawField(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number
): number {
  page.drawText(label + ":", { x, y, size: 7, font, color: GRAY });
  page.drawText(value, { x: x + 2, y: y - 11, size: 9, font: fontBold, color: BLACK });
  return y - 24;
}

// ── Photo fetching with concurrency limit ──

async function fetchPhotoImages(
  pdf: PDFDocument,
  photos: PdfPhoto[]
): Promise<(PDFImage | null)[]> {
  const CONCURRENCY = 6;
  const results: (PDFImage | null)[] = new Array(photos.length).fill(null);

  for (let i = 0; i < photos.length; i += CONCURRENCY) {
    const batch = photos.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (photo) => {
        try {
          const res = await fetch(photo.fileUrl);
          if (!res.ok) return null;
          const arrayBuf = await res.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);

          // Detect image type from first bytes (JPEG or PNG)
          if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
            return await pdf.embedJpg(bytes);
          } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
            return await pdf.embedPng(bytes);
          }
          // Try JPEG as fallback (most phone photos)
          return await pdf.embedJpg(bytes);
        } catch {
          return null;
        }
      })
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}
