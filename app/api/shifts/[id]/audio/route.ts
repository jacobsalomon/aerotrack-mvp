// POST /api/shifts/[id]/audio — Upload an audio chunk from the desk mic
// Transcribes the audio, extracts spoken measurements, cross-references
// with recent video measurements, and updates the measurement ledger.
// Accepts either mobile Bearer auth or the dashboard passcode session.

import { authenticateRequest } from "@/lib/mobile-auth";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/db";
import { transcribeAudio } from "@/lib/ai/openai";
import { extractMeasurementsFromTranscript } from "@/lib/ai/measurement-extraction";
import { recordMeasurement } from "@/lib/measurement-ledger";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id: shiftId } = await params;
  const allowedShiftStatuses = new Set(["active", "paused", "reconciling", "completed"]);

  try {
    const authHeader = request.headers.get("Authorization");
    let authenticatedTechnicianId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const auth = await authenticateRequest(request);
      if ("error" in auth) return auth.error;
      authenticatedTechnicianId = auth.technician.id;
    } else {
      const authError = requireDashboardAuth(request);
      if (authError) return authError;
    }

    // Verify shift exists, is still within a state that can accept buffered chunks,
    // and belongs to this technician when using mobile Bearer auth.
    const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }
    if (authenticatedTechnicianId && shift.technicianId !== authenticatedTechnicianId) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }
    if (!allowedShiftStatuses.has(shift.status)) {
      return NextResponse.json(
        { success: false, error: "Shift is no longer accepting buffered audio" },
        { status: 409 }
      );
    }

    // Get the audio file from the request
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const chunkTimestamp = formData.get("chunkTimestamp") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "audio file is required" },
        { status: 400 }
      );
    }

    // Parse chunk timestamp as a Date (ISO string like "2026-03-15T14:30:00Z")
    const chunkStartTime = chunkTimestamp ? new Date(chunkTimestamp).getTime() : Date.now();

    // Step 1: Transcribe the audio
    const transcription = await transcribeAudio(audioFile, audioFile.name || "chunk.webm");
    const transcriptText = transcription.text.trim();

    if (transcriptText) {
      await prisma.$transaction([
        prisma.shiftTranscriptChunk.create({
          data: {
            shiftSessionId: shiftId,
            transcript: transcriptText,
            source: "desk_mic",
            startedAt: chunkTimestamp ? new Date(chunkTimestamp) : null,
            durationSeconds: transcription.duration ?? null,
          },
        }),
        prisma.shiftSession.update({
          where: { id: shiftId },
          data: {
            transcriptDraft: null,
            transcriptUpdatedAt: new Date(),
            transcriptReviewStatus:
              shift.status === "completed" || shift.status === "reconciling"
                ? "review_required"
                : "capturing",
            transcriptApprovedAt: null,
            transcriptApprovedBy: null,
            quantumExportedAt: null,
          },
        }),
      ]);
    }

    // Step 2: Extract measurements from the transcript
    const extracted = await extractMeasurementsFromTranscript(
      transcriptText,
      transcription.words
    );

    // Step 3: Record each measurement in the ledger (with cross-referencing)
    const recorded = [];
    for (const m of extracted) {
      const measurement = await recordMeasurement({
        shiftSessionId: shiftId,
        measurementType: m.measurementType,
        parameterName: m.parameterName,
        value: m.value,
        unit: m.unit,
        allowedShiftStatuses: ["active", "paused", "reconciling", "completed"],
        source: {
          sourceType: "audio_callout",
          confidence: m.confidence,
          rawExcerpt: m.rawExcerpt,
          // Offset from chunk start in seconds, converted to epoch seconds
          timestamp:
            m.timestampInChunk !== undefined && m.timestampInChunk !== null
              ? (chunkStartTime / 1000 + m.timestampInChunk)
              : undefined,
        },
      });
      recorded.push(measurement);
    }

    return NextResponse.json({
      success: true,
      data: {
        transcription: {
          text: transcriptText,
          duration: transcription.duration,
          model: transcription.model,
        },
        measurementsExtracted: extracted.length,
        measurements: recorded,
      },
    });
  } catch (error) {
    console.error("Audio processing error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process audio chunk" },
      { status: 500 }
    );
  }
}
