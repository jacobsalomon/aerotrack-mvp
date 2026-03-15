// POST /api/shifts/[id]/export — Generate ERP export JSON
// GET  /api/shifts/[id]/export — Download the export as a file
// Open for web dashboard (no Bearer token required)

import { prisma } from "@/lib/db";
import { generateErpExport } from "@/lib/erp-export";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const { id: shiftId } = await params;

  try {
    const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }

    const exportPayload = await generateErpExport(shiftId);

    return NextResponse.json({ success: true, data: exportPayload });
  } catch (error) {
    console.error("ERP export error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate export" },
      { status: 500 }
    );
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: shiftId } = await params;

  try {
    const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }

    const exportPayload = await generateErpExport(shiftId);

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="shift-${shiftId}-export.json"`,
      },
    });
  } catch (error) {
    console.error("ERP export download error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to download export" },
      { status: 500 }
    );
  }
}
