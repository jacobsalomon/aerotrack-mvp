import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { resumeShift, startShift } from "@/lib/shift-session";
import { NextResponse } from "next/server";

const shiftSummarySelect = {
  id: true,
  status: true,
  startedAt: true,
  endedAt: true,
  totalDurationMin: true,
  notes: true,
  transcriptReviewStatus: true,
  transcriptApprovedAt: true,
  transcriptUpdatedAt: true,
  quantumExportedAt: true,
  _count: {
    select: {
      measurements: true,
      captureSessions: true,
      transcriptChunks: true,
    },
  },
} as const;

async function getActiveShiftSummary(technicianId: string, organizationId: string) {
  return prisma.shiftSession.findFirst({
    where: {
      technicianId,
      organizationId,
      status: { in: ["active", "paused"] },
    },
    select: shiftSummarySelect,
    orderBy: { startedAt: "desc" },
  });
}

async function getPendingTranscriptShiftSummary(
  technicianId: string,
  organizationId: string
) {
  return prisma.shiftSession.findFirst({
    where: {
      technicianId,
      organizationId,
      status: "completed",
      transcriptReviewStatus: "review_required",
    },
    select: shiftSummarySelect,
    orderBy: [{ endedAt: "desc" }, { updatedAt: "desc" }],
  });
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const [activeShift, pendingTranscriptShift] = await Promise.all([
      getActiveShiftSummary(auth.technician.id, auth.technician.organizationId),
      getPendingTranscriptShiftSummary(auth.technician.id, auth.technician.organizationId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        activeShift,
        pendingTranscriptShift,
      },
    });
  } catch (error) {
    console.error("Get mobile work status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load work status" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const notes =
      typeof body?.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : undefined;
    const measurementSpecId =
      typeof body?.measurementSpecId === "string" && body.measurementSpecId.trim().length > 0
        ? body.measurementSpecId.trim()
        : undefined;

    const current = await prisma.shiftSession.findFirst({
      where: {
        technicianId: auth.technician.id,
        organizationId: auth.technician.organizationId,
        status: { in: ["active", "paused"] },
      },
      select: { id: true, status: true },
      orderBy: { startedAt: "desc" },
    });

    let shiftId = current?.id ?? null;

    if (!current) {
      const created = await startShift({
        technicianId: auth.technician.id,
        organizationId: auth.technician.organizationId,
        measurementSpecId,
        notes,
      });
      shiftId = created.id;
    } else if (current.status === "paused") {
      await resumeShift(current.id, auth.technician.id);
      shiftId = current.id;
    }

    if (!shiftId) {
      return NextResponse.json(
        { success: false, error: "Could not create or resume a work shift" },
        { status: 500 }
      );
    }

    const shift = await prisma.shiftSession.findUnique({
      where: { id: shiftId },
      select: shiftSummarySelect,
    });

    return NextResponse.json({ success: true, data: shift });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start work";
    const status =
      message.includes("already has an active") ? 409
      : message.includes("not found") ? 404
      : message.includes("must be active") ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
