// POST /api/shifts/[id]/audio — Upload an audio chunk from the desk mic
// Transcribes the audio, extracts spoken measurements, cross-references
// with recent video measurements, and updates the measurement ledger.
// Accepts either mobile Bearer auth or the dashboard passcode session.

import { authenticateRequest } from "@/lib/mobile-auth";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { transcribeAudio } from "@/lib/ai/openai";
import { correctTranscriptSegment } from "@/lib/ai/transcript-correction";
import { extractMeasurementsFromTranscript } from "@/lib/ai/measurement-extraction";
import { recordMeasurement } from "@/lib/measurement-ledger";
import { getCallHistory } from "@/lib/ai/provider";
import { NextResponse } from "next/server";

// Allow up to 60 seconds — transcription + measurement extraction can take 15-25s
export const maxDuration = 60;

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
      const authResult = await requireAuth(request);
      if (authResult.error) return authResult.error;
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

    console.log(
      `[Audio] Received chunk: size=${audioFile.size}, type=${audioFile.type}, name=${audioFile.name}, shift=${shiftId}`
    );

    // Reject empty or suspiciously tiny audio files (< 1KB is likely silence or corrupt)
    if (audioFile.size < 100) {
      console.warn(`[Audio] Chunk too small (${audioFile.size} bytes) — skipping`);
      return NextResponse.json({
        success: true,
        data: { transcription: { text: "", duration: 0, model: "skipped" }, measurementsExtracted: 0, measurements: [] },
      });
    }

    // Parse chunk timestamp as a Date (ISO string like "2026-03-15T14:30:00Z")
    const chunkStartTime = chunkTimestamp ? new Date(chunkTimestamp).getTime() : Date.now();

    // IMPORTANT: Read the file into a Buffer first. The FormData File stream
    // can only be consumed once. If we pass the raw File to transcribeAudio,
    // the first model in the fallback chain reads the stream, and all subsequent
    // models get an empty/corrupt file — causing "all 3 models failed".
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/webm";
    const safeName = audioFile.name || "chunk.webm";
    const fileForTranscription = new File([audioBuffer], safeName, { type: mimeType });

    // Step 1: Transcribe the audio
    console.log(`[Audio] Step 1: Starting transcription (chunk size=${audioBuffer.byteLength} bytes, type=${mimeType})...`);
    const t1 = Date.now();
    let transcription;
    try {
      transcription = await transcribeAudio(fileForTranscription, safeName);
    } catch (transcriptionError) {
      // Log the full error chain so we can debug which models failed and why
      const msg = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
      console.error(`[Audio] Step 1 FAILED after ${Date.now() - t1}ms: ${msg}`);
      throw transcriptionError;
    }
    const transcriptText = transcription.text.trim();
    console.log(
      `[Audio] Step 1 done in ${Date.now() - t1}ms: "${transcriptText.slice(0, 100)}" (model=${transcription.model})`
    );

    // Step 1b: Save raw transcript immediately so the UI shows it right away
    let chunkId: string | null = null;
    if (transcriptText) {
      console.log("[Audio] Step 1b: Saving raw transcript chunk to DB...");
      const chunk = await prisma.shiftTranscriptChunk.create({
        data: {
          shiftSessionId: shiftId,
          transcript: transcriptText,
          correctionStatus: "raw",
          source: "desk_mic",
          startedAt: chunkTimestamp ? new Date(chunkTimestamp) : null,
          durationSeconds: transcription.duration ?? null,
        },
      });
      chunkId = chunk.id;
      await prisma.shiftSession.update({
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
      });
    }

    // Step 2: LLM correction pass — clean up filler words, format measurements, fix part numbers
    let correctedText = transcriptText;
    if (transcriptText && chunkId) {
      console.log("[Audio] Step 2: Running LLM correction...");
      const t2 = Date.now();
      try {
        await prisma.shiftTranscriptChunk.update({
          where: { id: chunkId },
          data: { correctionStatus: "correcting" },
        });
        correctedText = await correctTranscriptSegment(transcriptText);
        await prisma.shiftTranscriptChunk.update({
          where: { id: chunkId },
          data: {
            correctedTranscript: correctedText,
            correctionStatus: "corrected",
          },
        });
        console.log(`[Audio] Step 2 done in ${Date.now() - t2}ms: "${correctedText.slice(0, 100)}"`);
      } catch (correctionError) {
        console.error("[Audio] LLM correction failed, using raw transcript:", correctionError);
        await prisma.shiftTranscriptChunk.update({
          where: { id: chunkId },
          data: { correctionStatus: "failed" },
        }).catch(() => {}); // Don't fail the whole request if status update fails
      }
    }

    // Step 3: Extract measurements from the CORRECTED transcript (not raw)
    console.log("[Audio] Step 3: Extracting measurements from corrected text...");
    const t3 = Date.now();
    const extracted = await extractMeasurementsFromTranscript(
      correctedText,
      transcription.words
    );
    console.log(`[Audio] Step 3 done in ${Date.now() - t3}ms: ${extracted.length} measurements`);

    // Step 4: Record each measurement in the ledger (with cross-referencing)
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
          timestamp:
            m.timestampInChunk !== undefined && m.timestampInChunk !== null
              ? (chunkStartTime / 1000 + m.timestampInChunk)
              : undefined,
        },
      });
      recorded.push(measurement);
    }

    console.log(`[Audio] All steps complete for shift=${shiftId}`);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Include the recent AI call history so we can see exactly which models failed and why
    const recentCalls = getCallHistory().slice(-6);
    console.error("Audio processing error:", errorMessage, "Recent AI calls:", JSON.stringify(recentCalls));
    return NextResponse.json(
      {
        success: false,
        error: `Failed to process audio chunk: ${errorMessage.slice(0, 200)}`,
        // Include model failure details for debugging
        debug: recentCalls.map(c => `${c.model}: ${c.success ? "ok" : c.error?.slice(0, 100)}`),
      },
      { status: 500 }
    );
  }
}
