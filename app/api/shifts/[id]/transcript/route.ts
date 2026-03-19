import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import {
  buildShiftTranscriptReviewData,
  normalizeShiftTranscript,
  transcriptHasUnresolvedConflictMarkers,
} from "@/lib/shift-transcript";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/shifts/[id]/transcript — return raw transcript chunks for the live capture view
export async function GET(request: Request, { params }: RouteParams) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: shiftId } = await params;

  try {
    const chunks = await prisma.shiftTranscriptChunk.findMany({
      where: { shiftSessionId: shiftId },
      select: {
        id: true,
        transcript: true,
        correctedTranscript: true,
        correctionStatus: true,
        startedAt: true,
        createdAt: true,
      },
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
    });

    // Return the best available text: corrected if available, otherwise raw
    return NextResponse.json({
      success: true,
      chunks: chunks.map((c) => ({
        id: c.id,
        text: c.correctedTranscript || c.transcript,
        rawText: c.transcript,
        correctionStatus: c.correctionStatus,
        at: c.startedAt || c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get transcript chunks error:", error);
    return NextResponse.json({ success: false, error: "Failed to load transcript" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: shiftId } = await params;

  try {
    const body = await request.json();
    const action = body?.action;
    const transcript = typeof body?.transcript === "string" ? body.transcript : "";
    const lastKnownTranscriptUpdatedAtRaw = body?.lastKnownTranscriptUpdatedAt;
    const lastKnownTranscriptUpdatedAt =
      typeof lastKnownTranscriptUpdatedAtRaw === "string" &&
      lastKnownTranscriptUpdatedAtRaw.trim().length > 0
        ? new Date(lastKnownTranscriptUpdatedAtRaw)
        : null;

    if (action !== "save" && action !== "approve") {
      return NextResponse.json(
        { success: false, error: 'action must be "save" or "approve"' },
        { status: 400 }
      );
    }

    if (
      typeof lastKnownTranscriptUpdatedAtRaw === "string" &&
      lastKnownTranscriptUpdatedAtRaw.trim().length > 0 &&
      Number.isNaN(lastKnownTranscriptUpdatedAt?.getTime())
    ) {
      return NextResponse.json(
        { success: false, error: "lastKnownTranscriptUpdatedAt must be a valid date" },
        { status: 400 }
      );
    }

    const shift = await prisma.shiftSession.findUnique({
      where: { id: shiftId },
      include: {
        user: { select: { badgeNumber: true } },
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

    if (shift.status !== "completed") {
      return NextResponse.json(
        { success: false, error: "Transcript review is only available after work is completed" },
        { status: 409 }
      );
    }

    if (shift.transcriptUpdatedAt && !lastKnownTranscriptUpdatedAt) {
      return NextResponse.json(
        {
          success: false,
          staleTranscript: true,
          latestTranscriptUpdatedAt: shift.transcriptUpdatedAt.toISOString(),
          error: "Refresh the latest transcript before saving or approving notes.",
        },
        { status: 409 }
      );
    }

    if (
      shift.transcriptUpdatedAt &&
      lastKnownTranscriptUpdatedAt &&
      shift.transcriptUpdatedAt.getTime() > lastKnownTranscriptUpdatedAt.getTime()
    ) {
      return NextResponse.json(
        {
          success: false,
          staleTranscript: true,
          latestTranscriptUpdatedAt: shift.transcriptUpdatedAt.toISOString(),
          error:
            "New transcript audio arrived after this review copy loaded. Refresh and review the latest notes before continuing.",
        },
        { status: 409 }
      );
    }

    const normalizedTranscript = normalizeShiftTranscript(transcript);
    if (action === "approve" && !normalizedTranscript) {
      return NextResponse.json(
        { success: false, error: "Transcript cannot be empty when approving for Quantum" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const reviewData = buildShiftTranscriptReviewData({
        transcriptDraft: shift.transcriptDraft,
        transcriptChunks: shift.transcriptChunks,
      });
      const normalizedAutoTranscript = normalizeShiftTranscript(reviewData.autoTranscriptText);
      const approvalStillUsesUnresolvedConflicts =
        reviewData.validationSummary.conflictingSegments > 0 &&
        (normalizedTranscript === normalizedAutoTranscript ||
          transcriptHasUnresolvedConflictMarkers(normalizedTranscript));

      if (approvalStillUsesUnresolvedConflicts) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Resolve the conflicting transcript windows before approving for Quantum.",
          },
          { status: 409 }
        );
      }
    }

    const updatedShift = await prisma.shiftSession.update({
      where: { id: shiftId },
      data: {
        transcriptDraft: normalizedTranscript || null,
        transcriptUpdatedAt: new Date(),
        transcriptReviewStatus: action === "approve" ? "approved" : "review_required",
        transcriptApprovedAt: action === "approve" ? new Date() : null,
        transcriptApprovedBy: action === "approve" ? shift.user.badgeNumber : null,
        quantumExportedAt: null,
      },
      select: {
        id: true,
        transcriptReviewStatus: true,
        transcriptDraft: true,
        transcriptApprovedAt: true,
        transcriptApprovedBy: true,
        transcriptUpdatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedShift });
  } catch (error) {
    console.error("Shift transcript update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update transcript" },
      { status: 500 }
    );
  }
}
