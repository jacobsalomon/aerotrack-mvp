// POST /api/shifts/[id]/export — Generate ERP export JSON
// GET  /api/shifts/[id]/export — Download the export as a file
// Protected by dashboard passcode auth

import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/db";
import { generateErpExport } from "@/lib/erp-export";
import { buildShiftTranscript, canExportShiftToQuantum } from "@/lib/shift-transcript";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const authError = requireDashboardAuth(_request);
  if (authError) return authError;

  const { id: shiftId } = await params;

  try {
    const shift = await prisma.shiftSession.findUnique({
      where: { id: shiftId },
      include: {
        transcriptChunks: {
          select: {
            transcript: true,
            source: true,
            startedAt: true,
            createdAt: true,
            durationSeconds: true,
          },
          orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }

    const transcriptText = buildShiftTranscript({
      transcriptDraft: shift.transcriptDraft,
      transcriptChunks: shift.transcriptChunks,
    });

    if (
      !canExportShiftToQuantum({
        status: shift.status,
        transcriptReviewStatus: shift.transcriptReviewStatus,
        transcriptText,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Transcript approval is required before pushing this shift to Quantum",
        },
        { status: 409 }
      );
    }

    const exportPayload = await generateErpExport(shiftId);
    await prisma.shiftSession.update({
      where: { id: shiftId },
      data: { quantumExportedAt: new Date() },
    });

    return NextResponse.json({ success: true, data: exportPayload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate export";
    const status = message.includes("Transcript approval is required") ? 409 : 500;
    console.error("ERP export error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const authError = requireDashboardAuth(_request);
  if (authError) return authError;

  const { id: shiftId } = await params;

  try {
    const shift = await prisma.shiftSession.findUnique({
      where: { id: shiftId },
      include: {
        transcriptChunks: {
          select: {
            transcript: true,
            source: true,
            startedAt: true,
            createdAt: true,
            durationSeconds: true,
          },
          orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }

    const transcriptText = buildShiftTranscript({
      transcriptDraft: shift.transcriptDraft,
      transcriptChunks: shift.transcriptChunks,
    });

    if (
      !canExportShiftToQuantum({
        status: shift.status,
        transcriptReviewStatus: shift.transcriptReviewStatus,
        transcriptText,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Transcript approval is required before pushing this shift to Quantum",
        },
        { status: 409 }
      );
    }

    const exportPayload = await generateErpExport(shiftId);
    await prisma.shiftSession.update({
      where: { id: shiftId },
      data: { quantumExportedAt: new Date() },
    });

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="shift-${shiftId}-export.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to download export";
    const status = message.includes("Transcript approval is required") ? 409 : 500;
    console.error("ERP export download error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
