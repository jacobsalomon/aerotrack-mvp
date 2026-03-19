// POST /api/sessions/[id]/audio — Upload a desk mic audio chunk for a capture session.
// Persists the audio to Vercel Blob, registers it as AUDIO_CHUNK evidence,
// then transcribes it. The raw audio is kept for replay and audit purposes.

import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { transcribeAudio } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;

  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.error;

    // Verify session exists and is still capturing
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }
    if (session.status !== "capturing") {
      return NextResponse.json(
        { success: false, error: "Session is no longer capturing" },
        { status: 409 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const chunkTimestamp = formData.get("chunkTimestamp") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "audio file is required" },
        { status: 400 }
      );
    }

    // Step 1: Persist the raw audio to Vercel Blob so it's replayable
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : "webm";
    const timestamp = chunkTimestamp
      ? new Date(chunkTimestamp).toISOString().replace(/[:.]/g, "-")
      : String(Date.now());
    const blobPath = `evidence/${sessionId}/desk-mic-${timestamp}.${ext}`;

    const blob = await uploadFile(audioBuffer, blobPath, mimeType);

    // Step 2: Transcribe the audio chunk
    const transcription = await transcribeAudio(
      audioFile,
      audioFile.name || `desk-mic-chunk.${ext}`
    );
    const transcriptText = transcription.text.trim();

    // Step 3: Register as AUDIO_CHUNK evidence with the real Blob URL
    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId,
        type: "AUDIO_CHUNK",
        fileUrl: blob.url,
        fileSize: audioBuffer.byteLength,
        mimeType,
        durationSeconds: transcription.duration ?? null,
        transcription: transcriptText || null,
        capturedAt: chunkTimestamp ? new Date(chunkTimestamp) : new Date(),
      },
    });

    // Step 4: Also create a ShiftTranscriptChunk if session is linked to a shift
    if (transcriptText && session.shiftSessionId) {
      await prisma.shiftTranscriptChunk.create({
        data: {
          shiftSessionId: session.shiftSessionId,
          transcript: transcriptText,
          source: "desk_mic",
          startedAt: chunkTimestamp ? new Date(chunkTimestamp) : null,
          durationSeconds: transcription.duration ?? null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        evidenceId: evidence.id,
        blobUrl: blob.url,
        transcription: {
          text: transcriptText,
          duration: transcription.duration,
        },
      },
    });
  } catch (error) {
    console.error("Session audio processing error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process audio chunk" },
      { status: 500 }
    );
  }
}
