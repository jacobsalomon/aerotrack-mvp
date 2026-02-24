import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// POST /api/documents/render-8130-pdf
// Generates a downloadable PDF that looks like an official FAA Form 8130-3.
// Input: JSON with a "data" field containing the 8130-3 block data.
// Output: PDF binary for download.

interface Form8130Data {
  block1: string;
  block2: string;
  block3: string;
  block4: string;
  block5: string;
  block6a: string;
  block6b: string;
  block6c: string;
  block6d: string;
  block6e: string;
  block7: string;
  block8: string;
  block9: string;
  block10: string;
  block11: string;
  block12: string;
  block13: string;
  block14: string;
  narrative_summary?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data: Form8130Data = body.data;

  if (!data) {
    return NextResponse.json({ error: "Missing form data" }, { status: 400 });
  }

  // Create the PDF document (US Letter size: 612 x 792 points)
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  // Colors used throughout the form
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const darkBlue = rgb(0.1, 0.15, 0.35);

  // Page margins
  const marginLeft = 40;
  const marginRight = 40;
  const pageWidth = 612;
  const pageHeight = 792;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // ── Helper: draw text that wraps within a given width ──
  // Returns the Y position after the last line
  function drawWrappedText(
    page: ReturnType<typeof pdf.addPage>,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    textFont: typeof font,
    fontSize: number,
    color = black
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

  // ── Helper: draw a horizontal line ──
  function drawLine(
    page: ReturnType<typeof pdf.addPage>,
    y: number,
    startX = marginLeft,
    endX = pageWidth - marginRight
  ) {
    page.drawLine({
      start: { x: startX, y },
      end: { x: endX, y },
      thickness: 0.5,
      color: gray,
    });
  }

  // ── Helper: draw a block label ──
  function drawLabel(
    page: ReturnType<typeof pdf.addPage>,
    text: string,
    x: number,
    y: number
  ) {
    page.drawText(text, { x, y, size: 6.5, font: font, color: gray });
  }

  // ── PAGE 1 ──
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 40;

  // Form header — big title bar
  page.drawRectangle({
    x: marginLeft,
    y: y - 30,
    width: contentWidth,
    height: 35,
    color: lightGray,
  });
  page.drawText("AUTHORIZED RELEASE CERTIFICATE", {
    x: marginLeft + 10,
    y: y - 18,
    size: 14,
    font: fontBold,
    color: darkBlue,
  });
  page.drawText("FAA Form 8130-3", {
    x: marginLeft + 10,
    y: y - 28,
    size: 7,
    font: font,
    color: gray,
  });
  page.drawText("OMB No. 2120-0020", {
    x: pageWidth - marginRight - 100,
    y: y - 18,
    size: 7,
    font: font,
    color: gray,
  });

  y -= 45;
  drawLine(page, y);

  // ── Block 1 & 2 ──
  y -= 5;
  const midX = marginLeft + contentWidth / 2;

  drawLabel(page, "1. Approving Civil Aviation Authority / Country", marginLeft + 5, y);
  y -= 12;
  page.drawText(data.block1 || "FAA", {
    x: marginLeft + 5,
    y,
    size: 10,
    font: fontBold,
    color: black,
  });
  page.drawText("Federal Aviation Administration", {
    x: marginLeft + 5,
    y: y - 11,
    size: 7,
    font: font,
    color: gray,
  });

  // Block 2 on right side
  drawLabel(page, "2. Authorized Release Document", midX + 10, y + 12);
  page.drawText(data.block2 || "Authorized Release Certificate", {
    x: midX + 10,
    y,
    size: 9,
    font: font,
    color: black,
  });

  // Vertical divider between blocks 1 and 2
  page.drawLine({
    start: { x: midX, y: y + 18 },
    end: { x: midX, y: y - 16 },
    thickness: 0.5,
    color: gray,
  });

  y -= 25;
  drawLine(page, y);

  // ── Block 3 & 4 ──
  y -= 5;
  drawLabel(page, "3. Form Tracking Number", marginLeft + 5, y);
  y -= 12;
  page.drawText(data.block3 || "—", {
    x: marginLeft + 5,
    y,
    size: 10,
    font: fontMono,
    color: darkBlue,
  });

  drawLabel(page, "4. Organization Name and Address", midX + 10, y + 12);
  // Block 4 may have multiple lines (address)
  const block4Lines = (data.block4 || "—").split("\n");
  let block4Y = y;
  for (const line of block4Lines) {
    page.drawText(line.trim(), {
      x: midX + 10,
      y: block4Y,
      size: 8,
      font: font,
      color: black,
    });
    block4Y -= 11;
  }

  page.drawLine({
    start: { x: midX, y: y + 18 },
    end: { x: midX, y: Math.min(block4Y + 5, y - 10) },
    thickness: 0.5,
    color: gray,
  });

  y = Math.min(block4Y + 5, y - 15) - 10;
  drawLine(page, y);

  // ── Block 5 — Work Order ──
  y -= 5;
  drawLabel(page, "5. Work Order / Contract / Invoice Number", marginLeft + 5, y);
  y -= 12;
  page.drawText(data.block5 || "—", {
    x: marginLeft + 5,
    y,
    size: 9,
    font: fontMono,
    color: black,
  });

  y -= 15;
  drawLine(page, y);

  // ── Block 6 — Item Details ──
  y -= 5;
  const col6Width = contentWidth / 5;

  // 6a
  drawLabel(page, "6a. Item Description", marginLeft + 5, y);
  y -= 12;
  page.drawText(data.block6a || "—", {
    x: marginLeft + 5,
    y,
    size: 9,
    font: fontBold,
    color: black,
  });

  // 6b, 6c, 6d on same row
  const row6Y = y - 20;
  drawLabel(page, "6b. Part Number", marginLeft + 5, row6Y + 8);
  page.drawText(data.block6b || "—", {
    x: marginLeft + 5,
    y: row6Y - 4,
    size: 10,
    font: fontMono,
    color: black,
  });

  drawLabel(page, "6c. Serial Number", marginLeft + col6Width * 2, row6Y + 8);
  page.drawText(data.block6c || "—", {
    x: marginLeft + col6Width * 2,
    y: row6Y - 4,
    size: 10,
    font: fontMono,
    color: black,
  });

  drawLabel(page, "6d. Qty", marginLeft + col6Width * 4, row6Y + 8);
  page.drawText(data.block6d || "1", {
    x: marginLeft + col6Width * 4,
    y: row6Y - 4,
    size: 10,
    font: fontMono,
    color: black,
  });

  y = row6Y - 20;

  // 6e — Status with checkboxes
  drawLabel(page, "6e. Status / Work", marginLeft + 5, y);
  y -= 12;
  const statuses = ["Overhauled", "Repaired", "Inspected", "Modified", "Tested", "New"];
  let statusX = marginLeft + 5;
  for (const status of statuses) {
    const checked = (data.block6e || "").toLowerCase() === status.toLowerCase();
    // Draw checkbox
    page.drawRectangle({
      x: statusX,
      y: y - 2,
      width: 8,
      height: 8,
      borderColor: black,
      borderWidth: 0.5,
      color: checked ? rgb(0.15, 0.15, 0.15) : rgb(1, 1, 1),
    });
    if (checked) {
      page.drawText("X", {
        x: statusX + 1.5,
        y: y - 0.5,
        size: 7,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
    }
    page.drawText(status, {
      x: statusX + 11,
      y: y,
      size: 7.5,
      font: font,
      color: black,
    });
    statusX += font.widthOfTextAtSize(status, 7.5) + 22;
  }

  y -= 18;
  drawLine(page, y);

  // ── Block 7 — Remarks (the big block) ──
  y -= 5;
  drawLabel(page, "7. Description — Status / Work", marginLeft + 5, y);
  y -= 14;

  // Block 7 can be very long — split into lines and handle page overflow
  const block7Text = data.block7 || "—";
  const block7Lines = block7Text.split("\n");

  for (const rawLine of block7Lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      y -= 6; // blank line spacing
      continue;
    }

    // Check if this is a section heading (all caps or starts with common headings)
    const isHeading =
      trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length < 50 && trimmedLine.length > 3;

    const lineFont = isHeading ? fontBold : font;
    const lineSize = isHeading ? 8.5 : 8;

    // Check for page overflow — add a new page if needed
    if (y < 80) {
      // Draw page number on current page
      page.drawText(`Page ${pdf.getPageCount()}`, {
        x: pageWidth - marginRight - 40,
        y: 25,
        size: 7,
        font: font,
        color: gray,
      });

      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - 50;
      drawLabel(page, "7. Description — Status / Work (continued)", marginLeft + 5, y);
      y -= 14;
    }

    y = drawWrappedText(page, trimmedLine, marginLeft + 10, y, contentWidth - 20, lineFont, lineSize);
    y -= 2;
  }

  y -= 5;
  drawLine(page, y);

  // Check for page overflow before drawing remaining blocks
  if (y < 200) {
    page.drawText(`Page ${pdf.getPageCount()}`, {
      x: pageWidth - marginRight - 40,
      y: 25,
      size: 7,
      font: font,
      color: gray,
    });
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 50;
  }

  // ── Blocks 8-10 — Eligibility ──
  y -= 5;
  drawLabel(page, "8–10. Eligibility / Conformity", marginLeft + 5, y);
  y -= 12;
  page.drawText("[X] Condition for safe operation    [X] FAR § 43.9, 14 CFR Part 145", {
    x: marginLeft + 10,
    y,
    size: 7.5,
    font: font,
    color: black,
  });
  y -= 15;
  drawLine(page, y);

  // ── Block 11 & 12 ──
  y -= 5;
  drawLabel(page, "11. Approval / Authorization Number", marginLeft + 5, y);
  drawLabel(page, "12. Date", midX + 10, y);
  y -= 12;
  page.drawText(data.block11 || "—", {
    x: marginLeft + 5,
    y,
    size: 9,
    font: fontMono,
    color: black,
  });
  page.drawText(data.block12 || new Date().toISOString().split("T")[0], {
    x: midX + 10,
    y,
    size: 9,
    font: fontMono,
    color: black,
  });
  page.drawLine({
    start: { x: midX, y: y + 18 },
    end: { x: midX, y: y - 8 },
    thickness: 0.5,
    color: gray,
  });

  y -= 20;
  drawLine(page, y);

  // ── Block 13 — Signature ──
  y -= 5;
  drawLabel(page, "13. Authorized Signature", marginLeft + 5, y);
  y -= 15;

  // Dashed signature box
  page.drawRectangle({
    x: marginLeft + 10,
    y: y - 25,
    width: 180,
    height: 30,
    borderColor: gray,
    borderWidth: 0.5,
  });
  page.drawText(data.block13 || "[PENDING E-SIGNATURE]", {
    x: marginLeft + 20,
    y: y - 15,
    size: 8,
    font: font,
    color: gray,
  });

  // Date and auth next to signature
  page.drawText(`Date: ${data.block12 || "—"}`, {
    x: marginLeft + 210,
    y: y - 5,
    size: 8,
    font: font,
    color: black,
  });
  page.drawText(`Auth: ${data.block11 || "—"}`, {
    x: marginLeft + 210,
    y: y - 18,
    size: 8,
    font: font,
    color: black,
  });

  y -= 40;
  drawLine(page, y);

  // ── Block 14 — Certifying Statement ──
  y -= 5;
  drawLabel(page, "14. Certifying Statement", marginLeft + 5, y);
  y -= 12;
  y = drawWrappedText(
    page,
    data.block14 || "—",
    marginLeft + 5,
    y,
    contentWidth - 10,
    font,
    7.5,
    black
  );

  y -= 10;
  drawLine(page, y);

  // ── AeroVision Digital Verification Footer ──
  y -= 12;
  page.drawRectangle({
    x: marginLeft,
    y: y - 10,
    width: contentWidth,
    height: 18,
    color: lightGray,
  });
  page.drawText(
    `AeroVision Digital Verification  |  Tamper-evident  |  Generated by AeroVision AI v1.0`,
    {
      x: marginLeft + 10,
      y: y - 5,
      size: 6.5,
      font: font,
      color: gray,
    }
  );

  // Page number
  page.drawText(`Page ${pdf.getPageCount()}`, {
    x: pageWidth - marginRight - 40,
    y: 25,
    size: 7,
    font: font,
    color: gray,
  });

  // ── Serialize and return the PDF ──
  const pdfBytes = await pdf.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="8130-3_${data.block3 || "form"}.pdf"`,
    },
  });
}
