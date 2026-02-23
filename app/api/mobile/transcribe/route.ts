// POST /api/mobile/transcribe — Transcribe audio from capture session
// Accepts either:
//   1. JSON with audioBlobUrl (from client-side Vercel Blob upload — preferred)
//   2. FormData with file (legacy, subject to 4.5MB serverless limit)
// Uses GPT-4o-transcribe (best accuracy ~2.5% WER) with Groq Whisper fallback
// Returns word-level timestamps for searchable audio
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { transcribeWithFallback } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    let audioFile: File | Blob;
    let fileName: string;
    let evidenceId: string | null = null;
    let sessionId: string | null = null;
    let chunkIndex: string | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // New path: audio was uploaded to Vercel Blob, we get the URL
      const body = await request.json();
      const { audioBlobUrl, fileName: bodyFileName, mimeType } = body;
      evidenceId = body.evidenceId || null;
      sessionId = body.sessionId || null;
      chunkIndex = body.chunkIndex || null;

      if (!audioBlobUrl) {
        return NextResponse.json(
          { success: false, error: "audioBlobUrl is required" },
          { status: 400 }
        );
      }

      // Download audio from Vercel Blob
      const blobResponse = await fetch(audioBlobUrl);
      if (!blobResponse.ok) {
        return NextResponse.json(
          { success: false, error: "Could not retrieve audio file from blob storage" },
          { status: 500 }
        );
      }

      const buffer = Buffer.from(await blobResponse.arrayBuffer());
      audioFile = new Blob([buffer], { type: mimeType || "audio/m4a" });
      fileName = bodyFileName || "audio.m4a";
    } else {
      // Legacy path: audio sent as FormData (subject to 4.5MB limit)
      const formData = await request.formData();
      const formFile = formData.get("file") as File | null;
      evidenceId = formData.get("evidenceId") as string | null;
      sessionId = formData.get("sessionId") as string | null;
      chunkIndex = formData.get("chunkIndex") as string | null;

      if (!formFile) {
        return NextResponse.json(
          { success: false, error: "Audio file is required" },
          { status: 400 }
        );
      }

      audioFile = formFile;
      fileName = formFile.name || "audio.m4a";
    }

    // Transcribe with automatic fallback (GPT-4o-transcribe → Groq Whisper)
    const startTime = Date.now();
    const result = await transcribeWithFallback(audioFile, fileName);
    const latencyMs = Date.now() - startTime;

    // If we have an evidenceId, update the evidence record with the transcription
    if (evidenceId) {
      await prisma.captureEvidence.update({
        where: { id: evidenceId },
        data: {
          transcription: result.text,
          durationSeconds: result.duration,
        },
      });
    }

    // If we have a sessionId and chunkIndex, stitch into full session transcript
    // The full transcript is built by appending each chunk's text with timestamps
    if (sessionId && chunkIndex !== null) {
      const session = await prisma.captureSession.findUnique({
        where: { id: sessionId },
        select: { description: true },
      });

      // We store the stitched transcript fragments in a simple format
      // Each chunk gets appended with a time marker
      if (session && result.text.trim()) {
        const chunkNum = parseInt(chunkIndex) || 0;
        const timeOffset = chunkNum * 120; // Each chunk is ~2 minutes
        const marker = `[${formatTime(timeOffset)}] `;
        const existingDesc = session.description || "";
        const separator = existingDesc ? "\n" : "";

        // Append this chunk's transcript to the session description
        // (In production, this would be a dedicated fullTranscript field)
        await prisma.captureSession.update({
          where: { id: sessionId },
          data: {
            description: existingDesc + separator + marker + result.text.trim(),
          },
        });
      }
    }

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "audio_transcribed",
        entityType: "CaptureEvidence",
        entityId: evidenceId || null,
        metadata: JSON.stringify({
          model: result.model,
          usedFallback: result.usedFallback,
          durationSeconds: result.duration,
          transcriptionLength: result.text.length,
          wordCount: result.words.length,
          latencyMs,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        transcription: result.text,
        durationSeconds: result.duration,
        words: result.words,
        model: result.model,
        usedFallback: result.usedFallback,
      },
    });
  } catch (error) {
    console.error("Transcribe error:", error);
    return NextResponse.json(
      { success: false, error: "Transcription failed" },
      { status: 500 }
    );
  }
}

// Format seconds as MM:SS for transcript time markers
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
