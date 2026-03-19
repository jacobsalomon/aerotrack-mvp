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
import {
  getAllowedEvidenceHostsForError,
  isAllowedEvidenceUrl,
} from "@/lib/evidence-url";
import { NextResponse } from "next/server";

const PRIVILEGED_ROLES = new Set(["SUPERVISOR", "ADMIN"]);

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  // Mobile users must belong to an organization
  if (!auth.user.organizationId) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 400 }
    );
  }

  try {
    let audioFile: File | Blob;
    let fileName: string;
    let evidenceId: string | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // New path: audio was uploaded to Vercel Blob, we get the URL
      const body = await request.json();
      const { audioBlobUrl, fileName: bodyFileName, mimeType } = body;
      evidenceId = body.evidenceId || null;

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

    // If we have an evidenceId, update the evidence record with the transcription
    if (evidenceId) {
      const evidence = await prisma.captureEvidence.findUnique({
        where: { id: evidenceId },
        include: {
          session: {
            select: {
              userId: true,
              organizationId: true,
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
    }

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
