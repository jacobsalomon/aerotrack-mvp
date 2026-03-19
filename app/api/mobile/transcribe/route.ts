// POST /api/mobile/transcribe — Transcribe audio from capture session
// Accepts either:
//   1. JSON with audioBlobUrl (from client-side Vercel Blob upload — preferred)
//   2. FormData with file (legacy, subject to 4.5MB serverless limit)
// Uses the shared OpenAI transcription fallback chain
// Returns word-level timestamps for searchable audio
// Protected by API key authentication

// Allow up to 30 seconds for audio transcription
export const maxDuration = 30;

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { transcribeWithFallback } from "@/lib/ai/openai";
import { normalizeShiftTranscriptSource } from "@/lib/shift-transcript";
import {
  getAllowedEvidenceHostsForError,
  isAllowedEvidenceUrl,
} from "@/lib/evidence-url";
import { NextResponse } from "next/server";

const PRIVILEGED_ROLES = new Set(["SUPERVISOR", "ADMIN"]);

function inferTranscriptSource(
  explicitSource: string | null,
  sessionDescription: string | null | undefined
) {
  const explicit = normalizeShiftTranscriptSource(explicitSource);
  if (explicit !== "desk_mic" || explicitSource?.trim()) {
    return explicit;
  }

  return normalizeShiftTranscriptSource(sessionDescription);
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    let audioFile: File | Blob;
    let fileName: string;
    let evidenceId: string | null = null;
    let transcriptSource: string | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // New path: audio was uploaded to Vercel Blob, we get the URL
      const body = await request.json();
      const { audioBlobUrl, fileName: bodyFileName, mimeType } = body;
      evidenceId = body.evidenceId || null;
      transcriptSource =
        typeof body.transcriptSource === "string" ? body.transcriptSource : null;

      if (!audioBlobUrl) {
        return NextResponse.json(
          { success: false, error: "audioBlobUrl is required" },
          { status: 400 }
        );
      }

      if (!isAllowedEvidenceUrl(String(audioBlobUrl))) {
        return NextResponse.json(
          {
            success: false,
            error: `audioBlobUrl must be from an allowed host (${getAllowedEvidenceHostsForError()})`,
          },
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
      transcriptSource = formData.get("transcriptSource") as string | null;

      if (!formFile) {
        return NextResponse.json(
          { success: false, error: "Audio file is required" },
          { status: 400 }
        );
      }

      audioFile = formFile;
      fileName = formFile.name || "audio.m4a";
    }

    // Transcribe with automatic fallback (gpt-4o-transcribe → gpt-4o-mini-transcribe)
    const startTime = Date.now();
    const result = await transcribeWithFallback(audioFile, fileName);
    const latencyMs = Date.now() - startTime;
    let linkedShiftId: string | null = null;
    let linkedTranscriptSource: string | null = null;

    // If we have an evidenceId, update the evidence record with the transcription
    if (evidenceId) {
      const evidence = await prisma.captureEvidence.findUnique({
        where: { id: evidenceId },
        include: {
          session: {
            select: {
              userId: true,
              organizationId: true,
              shiftSessionId: true,
              description: true,
            },
          },
        },
      });

      if (!evidence) {
        return NextResponse.json(
          { success: false, error: "Evidence not found" },
          { status: 404 }
        );
      }

      const isSameOrganization =
        evidence.session.organizationId === auth.user.organizationId;
      const isOwner = evidence.session.userId === auth.user.id;
      const isPrivileged = PRIVILEGED_ROLES.has(auth.user.role);

      if (!isSameOrganization || (!isOwner && !isPrivileged)) {
        return NextResponse.json(
          { success: false, error: "Not authorized for this evidence" },
          { status: 403 }
        );
      }

      await prisma.captureEvidence.update({
        where: { id: evidenceId },
        data: {
          transcription: result.text,
          durationSeconds: result.duration,
        },
      });

      if (result.text.trim() && evidence.type === "AUDIO_CHUNK" && evidence.session.shiftSessionId) {
        linkedShiftId = evidence.session.shiftSessionId;
        linkedTranscriptSource = inferTranscriptSource(
          transcriptSource,
          evidence.session.description
        );
        const linkedShift = await prisma.shiftSession.findUnique({
          where: { id: linkedShiftId },
          select: { id: true, status: true },
        });

        if (linkedShift) {
          await prisma.$transaction([
            prisma.shiftTranscriptChunk.create({
              data: {
                shiftSessionId: linkedShiftId,
                transcript: result.text.trim(),
                source: linkedTranscriptSource,
                startedAt: evidence.capturedAt,
                durationSeconds: result.duration ?? null,
              },
            }),
            prisma.shiftSession.update({
              where: { id: linkedShiftId },
              data: {
                transcriptDraft: null,
                transcriptUpdatedAt: new Date(),
                transcriptReviewStatus:
                  linkedShift.status === "completed" ? "review_required" : "capturing",
                transcriptApprovedAt: null,
                transcriptApprovedBy: null,
                quantumExportedAt: null,
              },
            }),
          ]);
        }
      }
    }

    // NOTE: Real-time transcript stitching was removed to prevent race conditions.
    // When multiple chunks are transcribed concurrently, read-then-write to session
    // description caused chunks to overwrite each other. The pipeline's single-pass
    // stitching (in lib/ai/pipeline.ts) is now the sole source of truth for the
    // full transcript, processing all chunks at once after the session ends.

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
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
          linkedShiftId,
          transcriptSource: linkedTranscriptSource,
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
