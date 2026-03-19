// POST /api/mobile/analyze-session — Multi-source session analysis (US-002)
// Processes video + audio + photos in parallel with model fallback chains.
// Handles partial modality failures and uses cached fallback only if all modalities fail.

export const maxDuration = 120;

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { clampConfidence } from "@/lib/ai/utils";
import { isAllowedEvidenceUrl } from "@/lib/evidence-url";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  analyzeSessionVideo,
  deleteGeminiFile,
} from "@/lib/ai/gemini";
import { transcribeAudio, analyzeImageWithFallback } from "@/lib/ai/openai";
import { cachedSessionAnalysis } from "@/lib/ai/cached-responses";
import { NextResponse } from "next/server";

interface ModalityError {
  modality: "video" | "audio" | "photo";
  message: string;
}

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toTimestampedTranscript(
  chunks: Array<{ text: string; durationSeconds: number }>
): string | null {
  if (chunks.length === 0) return null;

  let cumulativeSeconds = 0;
  return chunks
    .map((chunk) => {
      const minutes = Math.floor(cumulativeSeconds / 60);
      const seconds = Math.floor(cumulativeSeconds % 60);
      const marker = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
      cumulativeSeconds += chunk.durationSeconds || 0;
      return `${marker} ${chunk.text}`;
    })
    .join("\n");
}

function detectConflicts(opts: {
  partsIdentified: Array<{ partNumber?: string | null; serialNumber?: string | null }>;
  photoExtractions: Array<Record<string, unknown>>;
  audioTranscript: string | null;
}): string[] {
  const partNumbers = new Set<string>();
  const serialNumbers = new Set<string>();

  for (const part of opts.partsIdentified) {
    if (part.partNumber) partNumbers.add(String(part.partNumber).trim().toUpperCase());
    if (part.serialNumber) serialNumbers.add(String(part.serialNumber).trim().toUpperCase());
  }

  for (const extraction of opts.photoExtractions) {
    const pn = extraction.partNumber;
    const sn = extraction.serialNumber;
    if (typeof pn === "string" && pn.trim()) partNumbers.add(pn.trim().toUpperCase());
    if (typeof sn === "string" && sn.trim()) serialNumbers.add(sn.trim().toUpperCase());
  }

  if (opts.audioTranscript) {
    const pnMatches = opts.audioTranscript.match(/\b\d{3,}-\d{2,}\b/g) || [];
    for (const match of pnMatches) {
      partNumbers.add(match.trim().toUpperCase());
    }

    const snRegex = /\bS\/?N[:\s-]*([A-Z0-9-]{3,})/gi;
    for (const match of opts.audioTranscript.matchAll(snRegex)) {
      if (match[1]) serialNumbers.add(match[1].trim().toUpperCase());
    }
  }

  const conflicts: string[] = [];
  if (partNumbers.size > 1) {
    conflicts.push(`Conflicting part numbers detected across evidence: ${Array.from(partNumbers).join(", ")}`);
  }
  if (serialNumbers.size > 1) {
    conflicts.push(`Conflicting serial numbers detected across evidence: ${Array.from(serialNumbers).join(", ")}`);
  }

  return conflicts;
}

function normalizePhotoExtraction(
  extraction: Record<string, unknown>
): {
  partNumber: string | null;
  serialNumber: string | null;
  description: string;
  confidence: number;
} {
  const nested =
    extraction.extractedData && typeof extraction.extractedData === "object"
      ? (extraction.extractedData as Record<string, unknown>)
      : null;

  const partNumber =
    (typeof extraction.partNumber === "string" && extraction.partNumber) ||
    (nested && typeof nested.partNumber === "string" ? nested.partNumber : null);

  const serialNumber =
    (typeof extraction.serialNumber === "string" && extraction.serialNumber) ||
    (nested && typeof nested.serialNumber === "string" ? nested.serialNumber : null);

  const description =
    (typeof extraction.description === "string" && extraction.description) ||
    (nested && typeof nested.condition === "string" ? nested.condition : null) ||
    "Extracted from photo";

  const confidence =
    typeof extraction.confidence === "number"
      ? extraction.confidence
      : typeof extraction.photoConfidence === "number"
      ? extraction.photoConfidence
      : 0.5;

  return {
    partNumber: partNumber ? String(partNumber) : null,
    serialNumber: serialNumber ? String(serialNumber) : null,
    description,
    confidence,
  };
}

async function loadCmmContent(session: { componentId: string | null }): Promise<string | undefined> {
  if (!session.componentId) return undefined;

  const component = await prisma.component.findUnique({
    where: { id: session.componentId },
    select: { partNumber: true },
  });

  if (!component) return undefined;

  const cmm = await prisma.componentManual.findFirst({
    where: { partNumber: component.partNumber },
    select: { fileUrl: true },
  });

  if (!cmm) return undefined;

  try {
    const response = await fetch(cmm.fileUrl);
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  let sessionId: string;
  try {
    const body = await request.json();
    sessionId = body.sessionId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId is required" },
      { status: 400 }
    );
  }

  try {
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      include: {
        evidence: { orderBy: { capturedAt: "asc" } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.userId !== auth.user.id) {
      return NextResponse.json(
        { success: false, error: "Not authorized for this session" },
        { status: 403 }
      );
    }

    const existingAnalysis = await prisma.sessionAnalysis.findUnique({
      where: { sessionId },
    });

    if (existingAnalysis) {
      return NextResponse.json({
        success: true,
        cached: true,
        data: {
          analysis: {
            ...existingAnalysis,
            actionLog: safeParse(existingAnalysis.actionLog, []),
            partsIdentified: safeParse(existingAnalysis.partsIdentified, []),
            procedureSteps: safeParse(existingAnalysis.procedureSteps, []),
            anomalies: safeParse(existingAnalysis.anomalies, []),
            photoExtractions: safeParse(existingAnalysis.photoExtractions, []),
            modelsUsed: safeParse(existingAnalysis.modelsUsed, {}),
          },
          message: "Analysis already exists for this session",
        },
      });
    }

    if (session.evidence.length === 0) {
      return NextResponse.json(
        { success: false, error: "No evidence in this session" },
        { status: 400 }
      );
    }

    const videoEvidence = session.evidence.filter((e) => e.type === "VIDEO");
    const audioEvidence = session.evidence.filter((e) => e.type === "AUDIO_CHUNK");
    const photoEvidence = session.evidence.filter((e) => e.type === "PHOTO");

    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: "processing" },
    });

    const startTime = Date.now();
    const cmmContent = await loadCmmContent(session);
    const modalityErrors: ModalityError[] = [];

    const videoTask = (async () => {
      if (videoEvidence.length === 0) {
        return { skipped: true as const };
      }

      const targetVideo = [...videoEvidence].sort((a, b) => {
        const aScore = (a.durationSeconds || 0) * 1000 + (a.fileSize || 0);
        const bScore = (b.durationSeconds || 0) * 1000 + (b.fileSize || 0);
        return bScore - aScore;
      })[0];

      const taskStart = Date.now();
      let uploadedFileName: string | null = null;

      try {
        if (!isAllowedEvidenceUrl(targetVideo.fileUrl)) {
          throw new Error("Video URL host is not allowed");
        }

        const fileResponse = await fetch(targetVideo.fileUrl);
        if (!fileResponse.ok) {
          throw new Error(`Could not retrieve video file (status ${fileResponse.status})`);
        }

        const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
        const uploadedFile = await uploadFileToGemini(
          fileBuffer,
          targetVideo.mimeType,
          `session-${sessionId}-full`
        );
        uploadedFileName = uploadedFile.name;

        const processedFile = await waitForFileProcessing(uploadedFile.name);
        const analysis = await analyzeSessionVideo(
          processedFile.uri,
          targetVideo.mimeType,
          cmmContent,
          session.expectedSteps || undefined
        );

        return {
          skipped: false as const,
          latencyMs: Date.now() - taskStart,
          evidenceId: targetVideo.id,
          ...analysis,
        };
      } finally {
        if (uploadedFileName) {
          deleteGeminiFile(uploadedFileName).catch(() => {});
        }
      }
    })().catch((error) => {
      modalityErrors.push({
        modality: "video",
        message: error instanceof Error ? error.message : "Video analysis failed",
      });
      return null;
    });

    const audioTask = (async () => {
      if (audioEvidence.length === 0) {
        return { skipped: true as const };
      }

      const taskStart = Date.now();
      const chunkResults = await Promise.all(
        audioEvidence.map(async (chunk) => {
          try {
            if (!isAllowedEvidenceUrl(chunk.fileUrl)) {
              throw new Error("Audio URL host is not allowed");
            }

            const response = await fetch(chunk.fileUrl);
            if (!response.ok) {
              throw new Error(`Could not retrieve audio file (status ${response.status})`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const blob = new Blob([buffer], { type: chunk.mimeType || "audio/m4a" });
            const result = await transcribeAudio(blob, `${chunk.id}.m4a`);

            await prisma.captureEvidence.update({
              where: { id: chunk.id },
              data: {
                transcription: result.text,
                durationSeconds: result.duration || chunk.durationSeconds || undefined,
              },
            });

            return {
              ok: true as const,
              evidenceId: chunk.id,
              text: result.text,
              durationSeconds: result.duration || chunk.durationSeconds || 0,
              model: result.model,
            };
          } catch (error) {
            return {
              ok: false as const,
              evidenceId: chunk.id,
              message:
                error instanceof Error ? error.message : "Audio chunk transcription failed",
            };
          }
        })
      );

      const successful = chunkResults.filter((r) => r.ok);
      const failed = chunkResults.filter((r) => !r.ok);

      if (successful.length === 0) {
        throw new Error(
          failed.length > 0
            ? `All audio chunks failed: ${failed.map((f) => f.message).join("; ")}`
            : "No successful audio transcriptions"
        );
      }

      const transcript = toTimestampedTranscript(
        successful.map((chunk) => ({
          text: chunk.text,
          durationSeconds: chunk.durationSeconds,
        }))
      );

      return {
        skipped: false as const,
        transcript,
        successfulChunks: successful.length,
        failedChunks: failed.length,
        chunkModels: successful.map((s) => ({ evidenceId: s.evidenceId, model: s.model })),
        chunkErrors: failed.map((f) => ({ evidenceId: f.evidenceId, message: f.message })),
        latencyMs: Date.now() - taskStart,
      };
    })().catch((error) => {
      modalityErrors.push({
        modality: "audio",
        message: error instanceof Error ? error.message : "Audio analysis failed",
      });
      return null;
    });

    const photoTask = (async () => {
      if (photoEvidence.length === 0) {
        return { skipped: true as const };
      }

      const taskStart = Date.now();
      const extractionResults = await Promise.all(
        photoEvidence.map(async (photo) => {
          try {
            if (!isAllowedEvidenceUrl(photo.fileUrl)) {
              throw new Error("Photo URL host is not allowed");
            }

            const response = await fetch(photo.fileUrl);
            if (!response.ok) {
              throw new Error(`Could not retrieve photo file (status ${response.status})`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const imageBase64 = buffer.toString("base64");
            const extraction = await analyzeImageWithFallback({
              imageBase64,
              mimeType: photo.mimeType,
            });

            await prisma.captureEvidence.update({
              where: { id: photo.id },
              data: { aiExtraction: JSON.stringify(extraction) },
            });

            return {
              ok: true as const,
              evidenceId: photo.id,
              extraction,
            };
          } catch (error) {
            return {
              ok: false as const,
              evidenceId: photo.id,
              message:
                error instanceof Error ? error.message : "Photo extraction failed",
            };
          }
        })
      );

      const successful = extractionResults.filter((r) => r.ok);
      const failed = extractionResults.filter((r) => !r.ok);

      if (successful.length === 0) {
        throw new Error(
          failed.length > 0
            ? `All photos failed: ${failed.map((f) => f.message).join("; ")}`
            : "No successful photo extractions"
        );
      }

      return {
        skipped: false as const,
        successfulPhotos: successful.length,
        failedPhotos: failed.length,
        extractions: successful.map((s) => ({ evidenceId: s.evidenceId, ...s.extraction })),
        photoModels: successful.map((s) => ({
          evidenceId: s.evidenceId,
          model: s.extraction.model,
          fallbackUsed: !!s.extraction.fallbackUsed,
          fallbackReason: s.extraction.fallbackReason || null,
        })),
        photoErrors: failed.map((f) => ({ evidenceId: f.evidenceId, message: f.message })),
        latencyMs: Date.now() - taskStart,
      };
    })().catch((error) => {
      modalityErrors.push({
        modality: "photo",
        message: error instanceof Error ? error.message : "Photo analysis failed",
      });
      return null;
    });

    const [videoResult, audioResult, photoResult] = await Promise.all([
      videoTask,
      audioTask,
      photoTask,
    ]);

    const allModalitiesFailed =
      (!videoResult || ("skipped" in videoResult && videoResult.skipped)) &&
      (!audioResult || ("skipped" in audioResult && audioResult.skipped)) &&
      (!photoResult || ("skipped" in photoResult && photoResult.skipped));

    const fallbackAnalysis = cachedSessionAnalysis;

    const actionLog =
      videoResult && !("skipped" in videoResult && videoResult.skipped)
        ? videoResult.actionLog
        : allModalitiesFailed
        ? fallbackAnalysis.actionLog
        : [];

    const videoParts =
      videoResult && !("skipped" in videoResult && videoResult.skipped)
        ? videoResult.partsIdentified
        : [];

    const photoExtractions: Array<Record<string, unknown>> =
      photoResult && !("skipped" in photoResult && photoResult.skipped)
        ? (photoResult.extractions as Array<Record<string, unknown>>)
        : allModalitiesFailed
        ? ((fallbackAnalysis.photoExtractions ?? []) as Array<Record<string, unknown>>)
        : [];

    const normalizedPhotoParts = photoExtractions
      .map(normalizePhotoExtraction)
      .filter((p) => p.partNumber || p.serialNumber);

    const partsIdentified = [
      ...videoParts,
      ...normalizedPhotoParts.map((p) => ({
          partNumber: p.partNumber || "unknown",
          serialNumber: p.serialNumber || undefined,
          description: p.description,
          confidence: p.confidence,
        })),
    ];

    const procedureSteps =
      videoResult && !("skipped" in videoResult && videoResult.skipped)
        ? videoResult.procedureSteps
        : allModalitiesFailed
        ? fallbackAnalysis.procedureSteps
        : [];

    const anomalies = [
      ...((videoResult && !("skipped" in videoResult && videoResult.skipped)
        ? videoResult.anomalies
        : allModalitiesFailed
        ? fallbackAnalysis.anomalies
        : []) as Array<{
        description: string;
        severity: "info" | "warning" | "critical";
        timestamp?: number;
      }>),
      ...modalityErrors.map((error) => ({
        description: `${error.modality.toUpperCase()} modality failed: ${error.message}`,
        severity: "warning" as const,
      })),
    ];

    const audioTranscript =
      audioResult && !("skipped" in audioResult && audioResult.skipped)
        ? audioResult.transcript
        : allModalitiesFailed
        ? fallbackAnalysis.audioTranscript
        : null;

    const conflicts = detectConflicts({
      partsIdentified,
      photoExtractions,
      audioTranscript,
    });

    for (const conflict of conflicts) {
      anomalies.push({
        description: conflict,
        severity: "warning",
      });
    }

    const modelsUsed = {
      video:
        videoResult && !("skipped" in videoResult && videoResult.skipped)
          ? {
              evidenceId: videoResult.evidenceId,
              model: videoResult.modelUsed,
              fallbackUsed: !!videoResult.fallbackUsed,
              fallbackReason: videoResult.fallbackReason || null,
              verificationSource: videoResult.verificationSource,
              latencyMs: videoResult.latencyMs,
            }
          : null,
      audio:
        audioResult && !("skipped" in audioResult && audioResult.skipped)
          ? {
              models: audioResult.chunkModels,
              failedChunks: audioResult.chunkErrors,
              successfulChunks: audioResult.successfulChunks,
              latencyMs: audioResult.latencyMs,
            }
          : null,
      photo:
        photoResult && !("skipped" in photoResult && photoResult.skipped)
          ? {
              models: photoResult.photoModels,
              failedPhotos: photoResult.photoErrors,
              successfulPhotos: photoResult.successfulPhotos,
              latencyMs: photoResult.latencyMs,
            }
          : null,
      overall: {
        usedCachedFallback: allModalitiesFailed,
        partialFailure: modalityErrors.length > 0 && !allModalitiesFailed,
        modalityErrors,
        conflicts,
      },
    };

    const confidence = clampConfidence(
      videoResult && !("skipped" in videoResult && videoResult.skipped)
        ? videoResult.confidence
        : allModalitiesFailed
        ? fallbackAnalysis.confidence
        : partsIdentified.length > 0 || audioTranscript
        ? 0.6
        : 0.4
    );

    const processingTime = Date.now() - startTime;

    const savedAnalysis = await prisma.sessionAnalysis.create({
      data: {
        sessionId,
        actionLog: JSON.stringify(actionLog),
        partsIdentified: JSON.stringify(partsIdentified),
        procedureSteps: JSON.stringify(procedureSteps),
        anomalies: JSON.stringify(anomalies),
        audioTranscript,
        photoExtractions: JSON.stringify(photoExtractions),
        modelsUsed: JSON.stringify(modelsUsed),
        confidence,
        verificationSource:
          videoResult && !("skipped" in videoResult && videoResult.skipped)
            ? videoResult.verificationSource
            : "ai_inferred",
        modelUsed: allModalitiesFailed
          ? "cached"
          : videoResult && !("skipped" in videoResult && videoResult.skipped)
          ? videoResult.modelUsed
          : "fused_multimodal",
        processingTime,
        costEstimate: null,
      },
    });

    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: "analysis_complete" },
    });

    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "session_analyzed",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: JSON.stringify({
          modelUsed: savedAnalysis.modelUsed,
          confidence,
          processingTime,
          counts: {
            actionLog: actionLog.length,
            partsIdentified: partsIdentified.length,
            procedureSteps: procedureSteps.length,
            anomalies: anomalies.length,
            photoExtractions: photoExtractions.length,
            hasAudioTranscript: !!audioTranscript,
          },
          modelsUsed,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        analysis: {
          ...savedAnalysis,
          actionLog,
          partsIdentified,
          procedureSteps,
          anomalies,
          audioTranscript,
          photoExtractions,
          modelsUsed,
        },
        processingTime,
        partialFailures: modalityErrors,
      },
    });
  } catch (error) {
    console.error("Analyze session error:", error);

    try {
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { status: "capturing" },
      });
    } catch {
      // best effort
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Session analysis failed",
      },
      { status: 500 }
    );
  }
}
