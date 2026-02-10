// ──────────────────────────────────────────────────────
// PDF Trace Report Export
//
// Generates a downloadable PDF containing the full back-to-birth
// trace for a component. Uses pdf-lib to build the document
// with a cover page, chronological timeline, and summary.
// ──────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { calculateTraceCompleteness, formatDuration } from "@/lib/trace-completeness";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import crypto from "crypto";

// ── Color constants ──

const COLORS = {
  darkBlue: rgb(0.1, 0.2, 0.4),
  blue: rgb(0.15, 0.35, 0.6),
  lightBlue: rgb(0.85, 0.9, 0.95),
  black: rgb(0, 0, 0),
  darkGray: rgb(0.3, 0.3, 0.3),
  gray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.85, 0.85, 0.85),
  white: rgb(1, 1, 1),
  red: rgb(0.8, 0.15, 0.15),
  lightRed: rgb(1, 0.9, 0.9),
  green: rgb(0.15, 0.6, 0.3),
  yellow: rgb(0.8, 0.65, 0.1),
  orange: rgb(0.85, 0.45, 0.1),
};

// Event type labels for PDF display
const eventLabels: Record<string, string> = {
  manufacture: "MANUFACTURED",
  install: "INSTALLED",
  remove: "REMOVED",
  receiving_inspection: "RECEIVING INSPECTION",
  teardown: "TEARDOWN",
  detailed_inspection: "DETAILED INSPECTION",
  repair: "REPAIR",
  reassembly: "REASSEMBLY",
  functional_test: "FUNCTIONAL TEST",
  final_inspection: "FINAL INSPECTION",
  release_to_service: "RELEASED TO SERVICE",
  transfer: "TRANSFER",
  retire: "RETIRED",
  scrap: "SCRAPPED",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const { componentId } = await params;

  // Load component with all relations
  const component = await prisma.component.findUnique({
    where: { id: componentId },
    include: {
      events: {
        include: {
          evidence: true,
          generatedDocs: true,
          partsConsumed: true,
        },
        orderBy: { date: "asc" },
      },
      alerts: true,
      documents: true,
      exceptions: true,
    },
  });

  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  // Calculate trace completeness
  const retiredDate =
    component.status === "retired" || component.status === "scrapped"
      ? component.events[component.events.length - 1]?.date?.toISOString()
      : undefined;

  const trace = calculateTraceCompleteness(
    component.manufactureDate.toISOString(),
    component.events.map((e) => ({
      ...e,
      date: e.date.toISOString(),
      evidence: e.evidence.map((ev) => ({
        id: ev.id,
        type: ev.type,
        fileName: ev.fileName,
        transcription: ev.transcription,
      })),
      generatedDocs: e.generatedDocs.map((d) => ({
        id: d.id,
        docType: d.docType,
        title: d.title,
      })),
      partsConsumed: e.partsConsumed.map((p) => ({
        id: p.id,
        partNumber: p.partNumber,
        description: p.description,
      })),
    })),
    component.documents.map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
    })),
    retiredDate
  );

  // Generate report hash for tamper evidence
  const reportData = JSON.stringify({
    componentId: component.id,
    partNumber: component.partNumber,
    serialNumber: component.serialNumber,
    traceScore: trace.score,
    eventCount: component.events.length,
    generatedAt: new Date().toISOString(),
  });
  const reportHash = crypto.createHash("sha256").update(reportData).digest("hex");

  // ── Build PDF ──

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  const PAGE_W = 612; // US Letter
  const PAGE_H = 792;
  const MARGIN = 50;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Helper: draw text with word wrap ──
  function drawWrappedText(
    page: ReturnType<typeof pdf.addPage>,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    fontToUse: typeof font,
    color = COLORS.darkGray
  ): number {
    const words = text.split(" ");
    let line = "";
    let currentY = y;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = fontToUse.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && line) {
        page.drawText(line, { x, y: currentY, size: fontSize, font: fontToUse, color });
        currentY -= fontSize + 3;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x, y: currentY, size: fontSize, font: fontToUse, color });
      currentY -= fontSize + 3;
    }
    return currentY;
  }

  // ════════════════════════════════════════════════
  // PAGE 1: COVER
  // ════════════════════════════════════════════════

  const coverPage = pdf.addPage([PAGE_W, PAGE_H]);

  // Header bar
  coverPage.drawRectangle({
    x: 0,
    y: PAGE_H - 100,
    width: PAGE_W,
    height: 100,
    color: COLORS.darkBlue,
  });

  coverPage.drawText("AeroTrack", {
    x: MARGIN,
    y: PAGE_H - 50,
    size: 28,
    font: fontBold,
    color: COLORS.white,
  });

  coverPage.drawText("Component Trace Report", {
    x: MARGIN,
    y: PAGE_H - 75,
    size: 14,
    font: font,
    color: rgb(0.7, 0.8, 0.9),
  });

  // Component info block
  let y = PAGE_H - 150;

  coverPage.drawText("Component Details", {
    x: MARGIN,
    y,
    size: 16,
    font: fontBold,
    color: COLORS.darkBlue,
  });
  y -= 30;

  const coverFields = [
    ["Part Number", component.partNumber],
    ["Serial Number", component.serialNumber],
    ["Description", component.description],
    ["OEM", `${component.oem}${component.oemDivision ? ` — ${component.oemDivision}` : ""}`],
    ["Manufacture Date", component.manufactureDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Total Hours", component.totalHours.toLocaleString()],
    ["Total Cycles", component.totalCycles.toLocaleString()],
    ["Status", component.status.charAt(0).toUpperCase() + component.status.slice(1)],
  ];

  for (const [label, value] of coverFields) {
    coverPage.drawText(`${label}:`, {
      x: MARGIN,
      y,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });
    coverPage.drawText(value, {
      x: MARGIN + 120,
      y,
      size: 10,
      font: font,
      color: COLORS.black,
    });
    y -= 18;
  }

  // Trace completeness box
  y -= 20;
  const scoreColor =
    trace.score > 95
      ? COLORS.green
      : trace.score >= 80
      ? COLORS.yellow
      : trace.score >= 60
      ? COLORS.orange
      : COLORS.red;

  coverPage.drawRectangle({
    x: MARGIN,
    y: y - 60,
    width: CONTENT_W,
    height: 80,
    color: COLORS.lightBlue,
    borderColor: COLORS.blue,
    borderWidth: 1,
  });

  coverPage.drawText("Trace Completeness", {
    x: MARGIN + 15,
    y: y,
    size: 14,
    font: fontBold,
    color: COLORS.darkBlue,
  });

  coverPage.drawText(`${trace.score}%`, {
    x: MARGIN + 15,
    y: y - 25,
    size: 28,
    font: fontBold,
    color: scoreColor,
  });

  const ratingText = trace.rating.charAt(0).toUpperCase() + trace.rating.slice(1);
  coverPage.drawText(ratingText, {
    x: MARGIN + 80,
    y: y - 20,
    size: 12,
    font: font,
    color: scoreColor,
  });

  coverPage.drawText(
    `${trace.totalEvents} events | ${trace.totalDocuments} documents | ${trace.gapCount} gap${trace.gapCount !== 1 ? "s" : ""} (${trace.totalGapDays} days)`,
    {
      x: MARGIN + 15,
      y: y - 45,
      size: 9,
      font: font,
      color: COLORS.gray,
    }
  );

  // Progress bar
  const barX = MARGIN + 250;
  const barY = y - 22;
  const barW = CONTENT_W - 270;
  const barH = 12;

  coverPage.drawRectangle({
    x: barX,
    y: barY,
    width: barW,
    height: barH,
    color: COLORS.lightGray,
  });
  coverPage.drawRectangle({
    x: barX,
    y: barY,
    width: barW * (trace.score / 100),
    height: barH,
    color: scoreColor,
  });

  // Report metadata
  y -= 100;
  const now = new Date();

  coverPage.drawText("Report Generated:", {
    x: MARGIN,
    y,
    size: 9,
    font: fontBold,
    color: COLORS.gray,
  });
  coverPage.drawText(
    now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    {
      x: MARGIN + 110,
      y,
      size: 9,
      font: font,
      color: COLORS.darkGray,
    }
  );
  y -= 16;

  coverPage.drawText("Report Hash:", {
    x: MARGIN,
    y,
    size: 9,
    font: fontBold,
    color: COLORS.gray,
  });
  coverPage.drawText(reportHash, {
    x: MARGIN + 110,
    y,
    size: 7,
    font: fontMono,
    color: COLORS.gray,
  });

  // Footer
  coverPage.drawText("Generated by AeroTrack — AI-Powered Component Lifecycle Management", {
    x: MARGIN,
    y: 40,
    size: 8,
    font: font,
    color: COLORS.gray,
  });

  // ════════════════════════════════════════════════
  // PAGE 2+: TIMELINE
  // ════════════════════════════════════════════════

  let timelinePage = pdf.addPage([PAGE_W, PAGE_H]);
  let ty = PAGE_H - 50;

  // Timeline header
  timelinePage.drawText("Component Lifecycle Timeline", {
    x: MARGIN,
    y: ty,
    size: 16,
    font: fontBold,
    color: COLORS.darkBlue,
  });
  ty -= 10;

  timelinePage.drawRectangle({
    x: MARGIN,
    y: ty,
    width: CONTENT_W,
    height: 1,
    color: COLORS.lightGray,
  });
  ty -= 20;

  // Sort events chronologically
  const sortedEvents = [...component.events].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Build gap map for timeline
  const gapMap = new Map<number, (typeof trace.gaps)[0]>();
  for (const gap of trace.gaps) {
    const idx = sortedEvents.findIndex(
      (e) => e.date.toISOString() === gap.startDate
    );
    if (idx >= 0) gapMap.set(idx, gap);
  }

  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    const gap = gapMap.get(i);

    // Check if we need a new page (need at least 120px for an event)
    if (ty < 120) {
      timelinePage = pdf.addPage([PAGE_W, PAGE_H]);
      ty = PAGE_H - 50;

      timelinePage.drawText("Component Lifecycle Timeline (continued)", {
        x: MARGIN,
        y: ty,
        size: 12,
        font: fontBold,
        color: COLORS.darkBlue,
      });
      ty -= 25;
    }

    // Event date
    const dateStr = event.date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Event type label
    const label = eventLabels[event.eventType] || event.eventType.toUpperCase();

    // Draw event dot
    timelinePage.drawCircle({
      x: MARGIN + 8,
      y: ty + 4,
      size: 4,
      color: COLORS.blue,
    });

    // Event header line
    timelinePage.drawText(label, {
      x: MARGIN + 22,
      y: ty,
      size: 10,
      font: fontBold,
      color: COLORS.black,
    });

    const dateWidth = font.widthOfTextAtSize(dateStr, 10);
    timelinePage.drawText(dateStr, {
      x: PAGE_W - MARGIN - dateWidth,
      y: ty,
      size: 10,
      font: font,
      color: COLORS.gray,
    });
    ty -= 14;

    // Facility
    timelinePage.drawText(event.facility, {
      x: MARGIN + 22,
      y: ty,
      size: 9,
      font: font,
      color: COLORS.gray,
    });
    ty -= 13;

    // Hours / Cycles
    if (event.hoursAtEvent != null || event.cyclesAtEvent != null) {
      const hcParts: string[] = [];
      if (event.hoursAtEvent != null) hcParts.push(`Hours: ${event.hoursAtEvent.toLocaleString()}`);
      if (event.cyclesAtEvent != null) hcParts.push(`Cycles: ${event.cyclesAtEvent.toLocaleString()}`);
      timelinePage.drawText(hcParts.join("  |  "), {
        x: MARGIN + 22,
        y: ty,
        size: 8,
        font: font,
        color: COLORS.gray,
      });
      ty -= 12;
    }

    // Description (wrapped)
    ty = drawWrappedText(
      timelinePage,
      event.description,
      MARGIN + 22,
      ty,
      CONTENT_W - 22,
      8,
      font,
      COLORS.darkGray
    );
    ty -= 3;

    // Work order and CMM references
    if (event.workOrderRef) {
      timelinePage.drawText(`WO: ${event.workOrderRef}`, {
        x: MARGIN + 22,
        y: ty,
        size: 7,
        font: fontMono,
        color: COLORS.gray,
      });
      ty -= 10;
    }

    if (event.cmmReference) {
      timelinePage.drawText(`Ref: ${event.cmmReference}`, {
        x: MARGIN + 22,
        y: ty,
        size: 7,
        font: fontMono,
        color: COLORS.gray,
      });
      ty -= 10;
    }

    // Notes
    if (event.notes) {
      ty -= 2;
      const noteText = `"${event.notes}"`;
      ty = drawWrappedText(
        timelinePage,
        noteText,
        MARGIN + 22,
        ty,
        CONTENT_W - 22,
        7,
        font,
        COLORS.orange
      );
      if (event.performerCert) {
        timelinePage.drawText(`— ${event.performer} (${event.performerCert})`, {
          x: MARGIN + 22,
          y: ty,
          size: 7,
          font: font,
          color: COLORS.gray,
        });
        ty -= 10;
      }
    }

    // Evidence counts
    const photos = event.evidence.filter((e) => e.type === "photo").length;
    const videos = event.evidence.filter((e) => e.type === "video").length;
    const voices = event.evidence.filter((e) => e.type === "voice_note").length;
    const docs = event.generatedDocs.length;
    if (photos > 0 || videos > 0 || voices > 0 || docs > 0) {
      const evidenceParts: string[] = [];
      if (docs > 0) evidenceParts.push(`${docs} doc${docs > 1 ? "s" : ""}`);
      if (photos > 0) evidenceParts.push(`${photos} photo${photos > 1 ? "s" : ""}`);
      if (videos > 0) evidenceParts.push(`${videos} video${videos > 1 ? "s" : ""}`);
      if (voices > 0) evidenceParts.push(`${voices} voice note${voices > 1 ? "s" : ""}`);
      timelinePage.drawText(evidenceParts.join("  |  "), {
        x: MARGIN + 22,
        y: ty,
        size: 7,
        font: font,
        color: COLORS.blue,
      });
      ty -= 10;
    }

    // Vertical connecting line
    ty -= 5;
    timelinePage.drawRectangle({
      x: MARGIN + 7,
      y: ty,
      width: 1,
      height: 8,
      color: COLORS.lightGray,
    });

    // Gap visualization
    if (gap) {
      ty -= 5;
      // Check for page break
      if (ty < 100) {
        timelinePage = pdf.addPage([PAGE_W, PAGE_H]);
        ty = PAGE_H - 50;
      }

      const gapColor = gap.severity === "critical" ? COLORS.red : COLORS.orange;

      timelinePage.drawRectangle({
        x: MARGIN + 15,
        y: ty - 20,
        width: CONTENT_W - 15,
        height: 28,
        color: COLORS.lightRed,
        borderColor: gapColor,
        borderWidth: 1,
      });

      timelinePage.drawText(
        `DOCUMENTATION GAP — ${formatDuration(gap.days)}`,
        {
          x: MARGIN + 22,
          y: ty - 2,
          size: 9,
          font: fontBold,
          color: gapColor,
        }
      );

      timelinePage.drawText(
        `No records between ${gap.lastFacility.split(",")[0]} and ${gap.nextFacility.split(",")[0]}. ${gap.days} days unaccounted.`,
        {
          x: MARGIN + 22,
          y: ty - 14,
          size: 7,
          font: font,
          color: COLORS.red,
        }
      );

      ty -= 35;
    } else if (i < sortedEvents.length - 1) {
      // Duration between events
      const nextEvt = sortedEvents[i + 1];
      const daysBetween = Math.ceil(
        (nextEvt.date.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysBetween > 1) {
        timelinePage.drawText(`— ${formatDuration(daysBetween)} —`, {
          x: MARGIN + 22,
          y: ty - 2,
          size: 7,
          font: font,
          color: COLORS.lightGray,
        });
        ty -= 15;
      } else {
        ty -= 5;
      }
    }
  }

  // ════════════════════════════════════════════════
  // FINAL PAGE: SUMMARY
  // ════════════════════════════════════════════════

  const summaryPage = pdf.addPage([PAGE_W, PAGE_H]);
  let sy = PAGE_H - 50;

  summaryPage.drawText("Trace Report Summary", {
    x: MARGIN,
    y: sy,
    size: 16,
    font: fontBold,
    color: COLORS.darkBlue,
  });
  sy -= 10;

  summaryPage.drawRectangle({
    x: MARGIN,
    y: sy,
    width: CONTENT_W,
    height: 1,
    color: COLORS.lightGray,
  });
  sy -= 30;

  // Summary fields
  const summaryFields = [
    ["Component", `${component.partNumber} / ${component.serialNumber}`],
    ["Description", component.description],
    ["Trace Completeness", `${trace.score}% (${trace.rating})`],
    ["Total Lifecycle", formatDuration(trace.totalDays)],
    ["Total Events", `${trace.totalEvents}`],
    ["Total Documents", `${trace.totalDocuments}`],
    ["Gaps Identified", `${trace.gapCount} (${trace.totalGapDays} total days)`],
    [
      "Open Exceptions",
      `${component.exceptions.filter((e) => e.status === "open" || e.status === "investigating").length}`,
    ],
    ["Trust Score", `${trace.score}/100`],
  ];

  for (const [label, value] of summaryFields) {
    summaryPage.drawText(`${label}:`, {
      x: MARGIN,
      y: sy,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });
    summaryPage.drawText(value, {
      x: MARGIN + 150,
      y: sy,
      size: 10,
      font: font,
      color: COLORS.black,
    });
    sy -= 22;
  }

  // Gap details if any
  if (trace.gaps.length > 0) {
    sy -= 15;
    summaryPage.drawText("Gap Details", {
      x: MARGIN,
      y: sy,
      size: 12,
      font: fontBold,
      color: COLORS.red,
    });
    sy -= 20;

    for (const gap of trace.gaps) {
      const startDate = new Date(gap.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const endDate = new Date(gap.endDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      summaryPage.drawText(
        `${startDate} — ${endDate}: ${formatDuration(gap.days)} gap (${gap.severity})`,
        {
          x: MARGIN + 10,
          y: sy,
          size: 9,
          font: font,
          color: gap.severity === "critical" ? COLORS.red : COLORS.orange,
        }
      );
      sy -= 14;

      summaryPage.drawText(
        `From: ${gap.lastFacility}  →  To: ${gap.nextFacility}`,
        {
          x: MARGIN + 10,
          y: sy,
          size: 8,
          font: font,
          color: COLORS.gray,
        }
      );
      sy -= 18;
    }
  }

  // Footer
  sy -= 20;
  summaryPage.drawRectangle({
    x: MARGIN,
    y: sy,
    width: CONTENT_W,
    height: 1,
    color: COLORS.lightGray,
  });
  sy -= 15;

  summaryPage.drawText(
    "This report was generated automatically by AeroTrack. Data integrity is verified by SHA-256 hashing.",
    {
      x: MARGIN,
      y: sy,
      size: 8,
      font: font,
      color: COLORS.gray,
    }
  );
  sy -= 12;
  summaryPage.drawText(`Report Hash: ${reportHash}`, {
    x: MARGIN,
    y: sy,
    size: 7,
    font: fontMono,
    color: COLORS.gray,
  });

  // ── Serialize and respond ──

  const pdfBytes = await pdf.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="trace-report-${component.serialNumber}.pdf"`,
    },
  });
}
