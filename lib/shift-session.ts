// Shift session business logic
// Handles starting, pausing, resuming, and ending work shifts.
// A shift is an 8-12 hour work session — the container for all measurements.

import { prisma } from "@/lib/db";
import {
  buildShiftTranscriptReviewData,
  canExportShiftToQuantum,
} from "@/lib/shift-transcript";

// Start a new shift for a user
export async function startShift({
  userId,
  organizationId,
  measurementSpecId,
  notes,
}: {
  userId: string;
  organizationId: string;
  measurementSpecId?: string;
  notes?: string;
}) {
  // Check for an already-active shift for this user
  const activeShift = await prisma.shiftSession.findFirst({
    where: { userId, status: { in: ["active", "paused"] } },
  });

  if (activeShift) {
    throw new Error(`User already has an active shift (${activeShift.id}). End it first.`);
  }

  // If a spec was chosen, verify it exists and belongs to the same org
  if (measurementSpecId) {
    const spec = await prisma.measurementSpec.findUnique({
      where: { id: measurementSpecId },
    });
    if (!spec || spec.organizationId !== organizationId) {
      throw new Error("Measurement spec not found");
    }
    if (spec.status !== "active") {
      throw new Error("Measurement spec must be active to use in a shift");
    }
  }

  return prisma.shiftSession.create({
    data: {
      userId,
      organizationId,
      measurementSpecId: measurementSpecId || null,
      notes: notes || null,
      transcriptReviewStatus: "capturing",
    },
    include: {
      measurementSpec: true,
      user: { select: { firstName: true, lastName: true, badgeNumber: true } },
    },
  });
}

// Pause an active shift (e.g., lunch break)
export async function pauseShift(shiftId: string, userId: string) {
  const shift = await getOwnedShift(shiftId, userId);
  if (shift.status !== "active") {
    throw new Error(`Cannot pause a shift that is ${shift.status}`);
  }

  return prisma.shiftSession.update({
    where: { id: shiftId },
    data: { status: "paused" },
  });
}

// Resume a paused shift
export async function resumeShift(shiftId: string, userId: string) {
  const shift = await getOwnedShift(shiftId, userId);
  if (shift.status !== "paused") {
    throw new Error(`Cannot resume a shift that is ${shift.status}`);
  }

  return prisma.shiftSession.update({
    where: { id: shiftId },
    data: { status: "active" },
  });
}

// End a shift — computes total duration
export async function endShift(shiftId: string, userId: string) {
  const shift = await getOwnedShift(shiftId, userId);
  if (shift.status === "completed") {
    throw new Error("Shift is already completed");
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - shift.startedAt.getTime();
  const totalDurationMin = Math.round(durationMs / 60000);

  return prisma.shiftSession.update({
    where: { id: shiftId },
    data: {
      status: "completed",
      endedAt,
      totalDurationMin,
      transcriptReviewStatus: "review_required",
    },
  });
}

// Get shift detail with measurement counts
// organizationId is optional — pass it for mobile API (scoped to org), omit for web dashboard
export async function getShiftDetail(shiftId: string, organizationId?: string) {
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftId },
    include: {
      user: { select: { firstName: true, lastName: true, badgeNumber: true } },
      measurementSpec: true,
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
      _count: {
        select: { measurements: true, captureSessions: true, transcriptChunks: true },
      },
    },
  });

  if (!shift) return null;
  if (organizationId && shift.organizationId !== organizationId) return null;

  const transcriptReview = buildShiftTranscriptReviewData({
    transcriptDraft: shift.transcriptDraft,
    transcriptChunks: shift.transcriptChunks,
  });

  // Get measurement status breakdown
  const measurements = await prisma.measurement.groupBy({
    by: ["status"],
    where: { shiftSessionId: shiftId },
    _count: true,
  });

  const statusCounts = Object.fromEntries(
    measurements.map((m) => [m.status, m._count])
  );

  const shiftData = {
    id: shift.id,
    userId: shift.userId,
    user: shift.user,
    organizationId: shift.organizationId,
    measurementSpecId: shift.measurementSpecId,
    measurementSpec: shift.measurementSpec,
    status: shift.status,
    startedAt: shift.startedAt,
    endedAt: shift.endedAt,
    totalDurationMin: shift.totalDurationMin,
    notes: shift.notes,
    transcriptUpdatedAt: shift.transcriptUpdatedAt,
    transcriptReviewStatus: shift.transcriptReviewStatus,
    transcriptApprovedAt: shift.transcriptApprovedAt,
    transcriptApprovedBy: shift.transcriptApprovedBy,
    quantumExportedAt: shift.quantumExportedAt,
    reconciliationJson: shift.reconciliationJson,
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
    _count: shift._count,
  };

  return {
    ...shiftData,
    transcriptText: transcriptReview.transcriptText,
    transcriptAutoText: transcriptReview.autoTranscriptText,
    transcriptSources: transcriptReview.sourceSummaries,
    transcriptSegments: transcriptReview.segments,
    transcriptValidation: transcriptReview.validationSummary,
    transcriptPendingReview: !canExportShiftToQuantum({
      status: shift.status,
      transcriptReviewStatus: shift.transcriptReviewStatus,
      transcriptText: transcriptReview.transcriptText,
    }),
    specItems: shift.measurementSpec
      ? JSON.parse(shift.measurementSpec.specItemsJson)
      : null,
    measurementStatusCounts: statusCounts,
  };
}

// Helper — fetch a shift and verify the user owns it
async function getOwnedShift(shiftId: string, userId: string) {
  const shift = await prisma.shiftSession.findUnique({
    where: { id: shiftId },
  });

  if (!shift) {
    throw new Error("Shift not found");
  }
  if (shift.userId !== userId) {
    throw new Error("Not authorized for this shift");
  }

  return shift;
}
