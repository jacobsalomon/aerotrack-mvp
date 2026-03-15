// POST /api/shifts/[id]/audio — Upload an audio chunk from the desk mic
// Transcribes the audio, extracts spoken measurements, cross-references
// with recent video measurements, and updates the measurement ledger.
// Protected by API key authentication (mobile/glasses only)

import { authenticateRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { transcribeAudio } from "@/lib/ai/openai";
import { extractMeasurementsFromTranscript } from "@/lib/ai/measurement-extraction";
import { recordMeasurement } from "@/lib/measurement-ledger";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id: shiftId } = await params;

  try {
    // Verify shift exists, is active, and belongs to this technician
    const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }
    if (shift.technicianId !== auth.technician.id) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }
    if (shift.status !== "active") {
      return NextResponse.json({ success: false, error: "Shift is not active" }, { status: 409 });
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

    // Step 2: Extract measurements from the transcript
    const extracted = await extractMeasurementsFromTranscript(
      transcription.text,
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
        source: {
          sourceType: "audio_callout",
          confidence: m.confidence,
          rawExcerpt: m.rawExcerpt,
          // Offset from chunk start in seconds, converted to epoch seconds
          timestamp: m.timestampInChunk
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
          text: transcription.text,
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
