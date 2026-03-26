// POST /api/sessions/[id]/reprocess — Re-run transcript correction and measurement
// extraction on all existing audio evidence for a session using the latest models
// and prompts. Preserves the original audio in Vercel Blob — only updates
// transcriptions, measurements, and reconciliation results.

import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { correctTranscriptSegment } from "@/lib/ai/transcript-correction";
import {
  extractMeasurementsFromTranscript,
  getExtractionContext,
  reconcileSessionMeasurements,
} from "@/lib/ai/measurement-extraction";
import { recordMeasurement } from "@/lib/measurement-ledger";
import { getOrgInstructions } from "@/lib/ai/org-context";
import { transcribeAudio } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

// Allow up to 5 minutes — reprocessing can be slow for sessions with many chunks
export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;

  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.error;

    // Verify session exists
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    // Cross-org isolation: verify the session belongs to the authenticated user's org
    if (!authResult.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization assigned" },
        { status: 403 }
      );
    }
    if (session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    // Parse options from request body
    const body = await request.json().catch(() => ({}));
    const retranscribe = body.retranscribe ?? false; // Re-run speech-to-text too (slower)

    console.log(
      `[Reprocess] Starting reprocessing for session=${sessionId}, retranscribe=${retranscribe}`
    );

    // Load org instructions once
    const orgInstructions = session.organizationId
      ? await getOrgInstructions(session.organizationId)
      : null;

    // Load document context (expected measurements, reference data, form structure)
    const documentContext = await getExtractionContext(sessionId);

    // Fetch all audio chunks in chronological order
    const audioChunks = await prisma.captureEvidence.findMany({
      where: { sessionId, type: "AUDIO_CHUNK" },
      orderBy: { capturedAt: "asc" },
      select: {
        id: true,
        transcription: true,
        fileUrl: true,
        capturedAt: true,
        durationSeconds: true,
      },
    });

    if (audioChunks.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: "No audio chunks to reprocess",
          chunksProcessed: 0,
        },
      });
    }

    // Delete existing measurements so we can re-extract cleanly
    // (sources are cascade-deleted with measurements)
    const deletedCount = await prisma.measurement.deleteMany({
      where: { captureSessionId: sessionId },
    });
    console.log(
      `[Reprocess] Deleted ${deletedCount.count} existing measurements`
    );

    // Temporarily set session back to "capturing" so recordMeasurement works
    const originalStatus = session.status;
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: "capturing" },
    });

    const stats = {
      chunksProcessed: 0,
      transcriptionsUpdated: 0,
      measurementsExtracted: 0,
      errors: [] as string[],
    };

    try {
      // Process each chunk sequentially (need prior context from previous chunks)
      for (let i = 0; i < audioChunks.length; i++) {
        const chunk = audioChunks[i];
        let correctedText = chunk.transcription || "";

        try {
          // Step 1: Optionally re-transcribe from the original audio file
          if (retranscribe && chunk.fileUrl) {
            try {
              const audioResponse = await fetch(chunk.fileUrl);
              if (audioResponse.ok) {
                const audioBuffer = await audioResponse.arrayBuffer();
                const ext = chunk.fileUrl.includes(".m4a")
                  ? "m4a"
                  : chunk.fileUrl.includes(".mp3")
                    ? "mp3"
                    : "webm";
                const mimeType =
                  ext === "m4a"
                    ? "audio/mp4"
                    : ext === "mp3"
                      ? "audio/mpeg"
                      : "audio/webm";
                const file = new File(
                  [audioBuffer],
                  `reprocess-chunk.${ext}`,
                  { type: mimeType }
                );

                // Use previous chunk's transcript as context
                const prevTranscript =
                  i > 0 ? audioChunks[i - 1].transcription || undefined : undefined;

                const transcription = await transcribeAudio(
                  file,
                  `reprocess-chunk.${ext}`,
                  prevTranscript,
                  orgInstructions
                );
                correctedText = transcription.text.trim();
                stats.transcriptionsUpdated++;
              }
            } catch (transcribeError) {
              console.error(
                `[Reprocess] Failed to retranscribe chunk ${chunk.id}:`,
                transcribeError
              );
              // Fall through to use existing transcription
            }
          }

          // Step 2: Re-run LLM correction on the transcript
          if (correctedText) {
            const corrected = await correctTranscriptSegment(
              correctedText,
              orgInstructions
            );
            correctedText = corrected;

            // Update the evidence record with the re-corrected transcript
            await prisma.captureEvidence.update({
              where: { id: chunk.id },
              data: { transcription: correctedText },
            });
          }

          // Step 3: Build prior context from all previous chunks
          const priorTranscripts = audioChunks
            .slice(0, i)
            .filter((c) => c.transcription)
            .map((c) => c.transcription!)
            .join(" ");
          const priorWords = priorTranscripts.split(/\s+/);
          const priorContext =
            priorWords.length > 2000
              ? priorWords.slice(-2000).join(" ")
              : priorTranscripts;

          // Step 4: Extract measurements with document context
          const extracted = await extractMeasurementsFromTranscript(
            correctedText,
            [], // No word timings available for reprocessing
            priorContext || undefined,
            orgInstructions,
            documentContext || undefined
          );

          // Step 5: Record each measurement
          const chunkStartTime = chunk.capturedAt
            ? chunk.capturedAt.getTime() / 1000
            : Date.now() / 1000;

          for (const m of extracted) {
            try {
              await recordMeasurement({
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
                    m.timestampInChunk != null
                      ? chunkStartTime + m.timestampInChunk
                      : undefined,
                  captureEvidenceId: chunk.id,
                },
              });
              stats.measurementsExtracted++;
            } catch (measurementError) {
              console.error(
                "[Reprocess] Failed to record measurement:",
                measurementError
              );
            }
          }

          // Update the chunk's transcription in our local array for next iteration's context
          audioChunks[i] = { ...chunk, transcription: correctedText };
          stats.chunksProcessed++;

          console.log(
            `[Reprocess] Chunk ${i + 1}/${audioChunks.length}: ${extracted.length} measurements`
          );
        } catch (chunkError) {
          const msg =
            chunkError instanceof Error
              ? chunkError.message
              : String(chunkError);
          stats.errors.push(`Chunk ${chunk.id}: ${msg}`);
          console.error(`[Reprocess] Error on chunk ${chunk.id}:`, msg);
        }
      }

      // Step 6: Run reconciliation on the full stitched transcript
      const fullTranscript = audioChunks
        .filter((c) => c.transcription)
        .map((c) => {
          const minutes = Math.floor(
            ((c.capturedAt?.getTime() || 0) - (audioChunks[0].capturedAt?.getTime() || 0)) /
              60000
          );
          const seconds = Math.floor(
            (((c.capturedAt?.getTime() || 0) - (audioChunks[0].capturedAt?.getTime() || 0)) %
              60000) /
              1000
          );
          const marker = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
          return `${marker} ${c.transcription}`;
        })
        .join("\n");

      const reconciliation = await reconcileSessionMeasurements(
        sessionId,
        fullTranscript
      );
      console.log(`[Reprocess] Reconciliation:`, reconciliation);
    } finally {
      // Restore original session status
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { status: originalStatus },
      });
    }

    console.log(`[Reprocess] Complete for session=${sessionId}:`, stats);
    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        documentContextAvailable: documentContext.length > 0,
      },
    });
  } catch (error) {
    console.error("[Reprocess] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Reprocessing failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
