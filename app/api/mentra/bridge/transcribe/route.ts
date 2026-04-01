export const maxDuration = 30;

import { prisma } from "@/lib/db";
import { transcribeAudio } from "@/lib/ai/openai";
import {
  getAllowedEvidenceHostsForError,
  isAllowedEvidenceUrl,
} from "@/lib/evidence-url";
import { requireMentraBridge } from "@/lib/mentra-bridge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const bridgeAuth = await requireMentraBridge(request);
  if ("error" in bridgeAuth) return bridgeAuth.error;

  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || "").trim();
    const evidenceId = String(body.evidenceId || "").trim();
    const audioBlobUrl = String(body.audioBlobUrl || "").trim();
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "audio.wav";
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "audio/wav";
    const previousTranscript =
      typeof body.previousTranscript === "string" && body.previousTranscript.trim()
        ? body.previousTranscript.trim().slice(-2000)
        : undefined;

    if (!sessionId || !evidenceId || !audioBlobUrl) {
      return NextResponse.json(
        { success: false, error: "sessionId, evidenceId, and audioBlobUrl are required" },
        { status: 400 }
      );
    }

    if (!isAllowedEvidenceUrl(audioBlobUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: `audioBlobUrl must be from an allowed host (${getAllowedEvidenceHostsForError()})`,
        },
        { status: 400 }
      );
    }

    const evidence = await prisma.captureEvidence.findUnique({
      where: { id: evidenceId },
      include: {
        session: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
          },
        },
      },
    });

    if (!evidence || evidence.sessionId !== sessionId) {
      return NextResponse.json(
        { success: false, error: "Evidence not found for this session" },
        { status: 404 }
      );
    }

    const blobResponse = await fetch(audioBlobUrl);
    if (!blobResponse.ok) {
      return NextResponse.json(
        { success: false, error: "Could not retrieve audio file from blob storage" },
        { status: 500 }
      );
    }

    const audioBuffer = Buffer.from(await blobResponse.arrayBuffer());
    const audioFile = new Blob([audioBuffer], { type: mimeType });
    const startedAt = Date.now();
    const result = await transcribeAudio(audioFile, fileName, previousTranscript);
    const latencyMs = Date.now() - startedAt;

    await prisma.captureEvidence.update({
      where: { id: evidenceId },
      data: {
        transcription: result.text,
        durationSeconds: result.duration || evidence.durationSeconds,
      },
    });

    await prisma.auditLogEntry.create({
      data: {
        organizationId: evidence.session.organizationId,
        userId: evidence.session.userId,
        action: "mentra_bridge_audio_transcribed",
        entityType: "CaptureEvidence",
        entityId: evidenceId,
        metadata: {
          sessionId,
          model: result.model,
          durationSeconds: result.duration,
          transcriptionLength: result.text.length,
          wordCount: result.words.length,
          latencyMs,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        transcription: result.text,
        durationSeconds: result.duration,
        words: result.words,
        model: result.model,
      },
    });
  } catch (error) {
    console.error("[mentra bridge transcribe]", error);
    return NextResponse.json(
      { success: false, error: "Transcription failed" },
      { status: 500 }
    );
  }
}
