// POST /api/sessions/[id]/audio — Upload a desk mic audio chunk for a capture session.
// Persists the audio to Vercel Blob, transcribes it, runs LLM correction,
// extracts measurements, and records them in the measurement ledger.

import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { transcribeAudio } from "@/lib/ai/openai";
import { correctTranscriptSegment } from "@/lib/ai/transcript-correction";
import { extractMeasurementsFromTranscript } from "@/lib/ai/measurement-extraction";
import { recordMeasurement } from "@/lib/measurement-ledger";
import { getCallHistory } from "@/lib/ai/provider";
import { getOrgInstructions } from "@/lib/ai/org-context";
import { NextResponse } from "next/server";

// Allow up to 60 seconds — transcription + correction + measurement extraction
export const maxDuration = 60;

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

    // Fetch org-specific agent instructions once for the whole pipeline
    const orgInstructions = session.organizationId
      ? await getOrgInstructions(session.organizationId)
      : null;

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const chunkTimestamp = formData.get("chunkTimestamp") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "audio file is required" },
        { status: 400 }
      );
    }

    console.log(
      `[Audio] Received chunk: size=${audioFile.size}, type=${audioFile.type}, name=${audioFile.name}, session=${sessionId}`
    );

    // Reject empty or suspiciously tiny audio files (< 100 bytes is likely silence or corrupt)
    if (audioFile.size < 100) {
      console.warn(`[Audio] Chunk too small (${audioFile.size} bytes) — skipping`);
      return NextResponse.json({
        success: true,
        data: { transcription: { text: "", duration: 0, model: "skipped" }, measurementsExtracted: 0, measurements: [] },
      });
    }

    // Read the file into a Buffer once — FormData streams can only be consumed once.
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : "webm";
    const fileName = audioFile.name || `desk-mic-chunk.${ext}`;
    const timestamp = chunkTimestamp
      ? new Date(chunkTimestamp).toISOString().replace(/[:.]/g, "-")
      : String(Date.now());
    const blobPath = `evidence/${sessionId}/desk-mic-${timestamp}.${ext}`;
    const chunkStartTime = chunkTimestamp ? new Date(chunkTimestamp).getTime() : Date.now();

    // Step 1: Persist the raw audio to Vercel Blob so it's replayable
    const blob = await uploadFile(audioBuffer, blobPath, mimeType);

    // Step 1b: Look up the previous chunk's corrected transcript for cross-chunk continuity.
    // Passing it as context to the transcription API prevents words/numbers from being
    // split when they fall on a chunk boundary (e.g. "A2450" → "18" + "2450").
    const previousChunk = await prisma.captureEvidence.findFirst({
      where: { sessionId, type: "AUDIO_CHUNK" },
      orderBy: { capturedAt: "desc" },
      select: { transcription: true },
    });
    const previousTranscript = previousChunk?.transcription || undefined;

    // Step 2: Transcribe using a fresh File from the buffer (original stream is consumed)
    console.log(`[Audio] Step 2: Starting transcription (chunk size=${audioBuffer.byteLength} bytes, type=${mimeType}, hasPrevContext=${!!previousTranscript})...`);
    const t2 = Date.now();
    const fileForTranscription = new File([audioBuffer], fileName, { type: mimeType });
    let transcription;
    try {
      transcription = await transcribeAudio(fileForTranscription, fileName, previousTranscript, orgInstructions);
    } catch (transcriptionError) {
      const msg = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
      console.error(`[Audio] Step 2 FAILED after ${Date.now() - t2}ms: ${msg}`);
      throw transcriptionError;
    }
    const transcriptText = transcription.text.trim();
    console.log(
      `[Audio] Step 2 done in ${Date.now() - t2}ms: "${transcriptText.slice(0, 100)}" (model=${transcription.model})`
    );

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

    // Step 4: LLM correction — clean up filler words, format measurements, fix part numbers
    let correctedText = transcriptText;
    if (transcriptText) {
      console.log("[Audio] Step 4: Running LLM correction...");
      const t4 = Date.now();
      try {
        correctedText = await correctTranscriptSegment(transcriptText, orgInstructions);
        // Update the evidence record with the corrected transcript
        await prisma.captureEvidence.update({
          where: { id: evidence.id },
          data: { transcription: correctedText },
        });
        console.log(`[Audio] Step 4 done in ${Date.now() - t4}ms: "${correctedText.slice(0, 100)}"`);
      } catch (correctionError) {
        console.error("[Audio] LLM correction failed, using raw transcript:", correctionError);
      }
    }

    // Step 5: Extract measurements from the corrected transcript
    // Build prior context from ALL previous chunks so the AI can resolve
    // measurement labels that were split across chunk boundaries.
    const allPreviousChunks = await prisma.captureEvidence.findMany({
      where: { sessionId, type: "AUDIO_CHUNK", NOT: { id: evidence.id } },
      orderBy: { capturedAt: "asc" },
      select: { transcription: true },
    });
    const priorTranscripts = allPreviousChunks
      .filter(c => c.transcription)
      .map(c => c.transcription!)
      .join(" ");
    // Trim to last ~200 words to keep the prompt focused
    const priorWords = priorTranscripts.split(/\s+/);
    const priorContext = priorWords.length > 200
      ? priorWords.slice(-200).join(" ")
      : priorTranscripts;

    console.log(`[Audio] Step 5: Extracting measurements (priorContext=${priorContext.length} chars)...`);
    const t5 = Date.now();
    const extracted = await extractMeasurementsFromTranscript(
      correctedText,
      transcription.words,
      priorContext || undefined,
      orgInstructions
    );
    console.log(`[Audio] Step 5 done in ${Date.now() - t5}ms: ${extracted.length} measurements`);

    // Step 6: Record each measurement in the ledger
    const recorded = [];
    for (const m of extracted) {
      try {
        const measurement = await recordMeasurement({
          sessionId,
          measurementType: m.measurementType,
          parameterName: m.parameterName,
          value: m.value,
          unit: m.unit,
          source: {
            sourceType: "audio_callout",
            confidence: m.confidence,
            rawExcerpt: m.rawExcerpt,
            timestamp:
              m.timestampInChunk !== undefined && m.timestampInChunk !== null
                ? (chunkStartTime / 1000 + m.timestampInChunk)
                : undefined,
            captureEvidenceId: evidence.id,
          },
        });
        recorded.push(measurement);
      } catch (measurementError) {
        console.error("[Audio] Failed to record measurement:", measurementError);
      }
    }

    console.log(`[Audio] All steps complete for session=${sessionId}`);
    return NextResponse.json({
      success: true,
      data: {
        evidenceId: evidence.id,
        blobUrl: blob.url,
        transcription: {
          text: transcriptText,
          correctedText,
          duration: transcription.duration,
          model: transcription.model,
        },
        measurementsExtracted: extracted.length,
        measurements: recorded,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const recentCalls = getCallHistory().slice(-6);
    console.error("Session audio processing error:", errorMessage, "Recent AI calls:", JSON.stringify(recentCalls));
    return NextResponse.json(
      {
        success: false,
        error: `Failed to process audio chunk: ${errorMessage.slice(0, 200)}`,
        debug: recentCalls.map(c => `${c.model}: ${c.success ? "ok" : c.error?.slice(0, 100)}`),
      },
      { status: 500 }
    );
  }
}
