// POST /api/realtime-transcription/save — Save or update a real-time transcript
// Supports two modes:
//   1. First save (no evidenceId): creates a new CaptureEvidence record, returns its ID
//   2. Subsequent saves (with evidenceId): updates the existing record's transcript
// This lets the browser auto-save every ~30 seconds without creating duplicate records.
// If the tab crashes, at most 30 seconds of transcript is lost.
// Protected by dashboard auth (passcode cookie).

import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { sessionId, transcript, evidenceId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return NextResponse.json(
        { success: false, error: "transcript is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Verify the CaptureSession exists
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "CaptureSession not found" },
        { status: 404 }
      );
    }

    const trimmedTranscript = transcript.trim();

    // If evidenceId is provided, update the existing record instead of creating a new one
    if (evidenceId) {
      const existing = await prisma.captureEvidence.findUnique({
        where: { id: evidenceId },
        select: { id: true, sessionId: true },
      });

      if (!existing || existing.sessionId !== sessionId) {
        return NextResponse.json(
          { success: false, error: "Evidence record not found or does not belong to this session" },
          { status: 404 }
        );
      }

      await prisma.captureEvidence.update({
        where: { id: evidenceId },
        data: { transcription: trimmedTranscript },
      });

      return NextResponse.json({
        success: true,
        data: {
          evidenceId,
          sessionId: session.id,
          transcriptLength: trimmedTranscript.length,
          updated: true,
        },
      });
    }

    // First save — create a new CaptureEvidence record
    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId: session.id,
        type: "AUDIO_CHUNK",
        fileUrl: "realtime-transcript://browser-api",
        mimeType: "audio/webm",   // The browser mic format (even though we didn't store the file)
        transcription: trimmedTranscript,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        evidenceId: evidence.id,
        sessionId: session.id,
        transcriptLength: trimmedTranscript.length,
        updated: false,
      },
    });
  } catch (error) {
    console.error("Save transcript error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save transcript" },
      { status: 500 }
    );
  }
}
