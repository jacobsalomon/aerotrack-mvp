// POST /api/mobile/evidence — Register evidence from a client-side Vercel Blob upload
// The mobile app uploads files directly to Vercel Blob (bypassing the 4.5MB serverless limit),
// then calls this endpoint with the blob URL + metadata to create the database record.
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import {
  getAllowedEvidenceHostsForError,
  isAllowedEvidenceUrl,
} from "@/lib/evidence-url";
import { after, NextResponse } from "next/server";
import { analyzeImageWithFallback } from "@/lib/ai/openai";
import { transcribeWithFallback } from "@/lib/ai/openai";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  annotateVideoChunk,
  deleteGeminiFile,
} from "@/lib/ai/gemini";
import { clampConfidence } from "@/lib/ai/utils";

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
    const body = await request.json();
    const {
      sessionId,
      type,
      blobUrl,
      fileSize,
      fileHash,
      mimeType,
      capturedAt,
      gpsLatitude,
      gpsLongitude,
    } = body;

    if (!sessionId || !type || !blobUrl) {
      return NextResponse.json(
        { success: false, error: "sessionId, type, and blobUrl are required" },
        { status: 400 }
      );
    }

    // Validate blob URL and enforce storage host allowlist
    if (!isAllowedEvidenceUrl(String(blobUrl))) {
      return NextResponse.json(
        {
          success: false,
          error: `blobUrl must be an HTTPS URL from an allowed host (${getAllowedEvidenceHostsForError()})`,
        },
        { status: 400 }
      );
    }

    // Validate capturedAt is a valid date if provided
    if (capturedAt && isNaN(new Date(capturedAt).getTime())) {
      return NextResponse.json(
        { success: false, error: "capturedAt must be a valid date" },
        { status: 400 }
      );
    }

    // Validate evidence type — must be uppercase to match downstream filters
    const validTypes = ["PHOTO", "VIDEO", "AUDIO_CHUNK"];
    const normalizedType = String(type).toUpperCase();
    if (!validTypes.includes(normalizedType)) {
      return NextResponse.json(
        { success: false, error: `Invalid evidence type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify the session exists and belongs to this user
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
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

    // Save to database
    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId,
        type: normalizedType,
        fileUrl: blobUrl,
        fileSize: fileSize || 0,
        fileHash:
          typeof fileHash === "string" && fileHash.trim().length > 0
            ? fileHash.trim()
            : null,
        mimeType: mimeType || "application/octet-stream",
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        gpsLatitude: gpsLatitude && !isNaN(parseFloat(gpsLatitude)) ? parseFloat(gpsLatitude) : null,
        gpsLongitude: gpsLongitude && !isNaN(parseFloat(gpsLongitude)) ? parseFloat(gpsLongitude) : null,
      },
    });

    // Log it
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "evidence_captured",
        entityType: "CaptureEvidence",
        entityId: evidence.id,
        metadata: JSON.stringify({
          type,
          sessionId,
          fileSize: fileSize || 0,
          fileHash: evidence.fileHash,
        }),
      },
    });

    // Auto-trigger AI analysis in the background after responding.
    // This makes the web server the source of truth for analysis —
    // the iOS app doesn't need to call analyze/transcribe endpoints separately.
    // Each analysis function is idempotent (checks for existing results first).
    after(() =>
      autoAnalyzeEvidence(evidence.id, normalizedType, blobUrl, mimeType || "application/octet-stream")
    );

    return NextResponse.json({ success: true, data: evidence }, { status: 201 });
  } catch (error) {
    console.error("Evidence registration error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to register evidence" },
      { status: 500 }
    );
  }
}

// Background analysis — runs after the response is sent.
// Failures here are logged but don't affect evidence registration.
async function autoAnalyzeEvidence(
  evidenceId: string,
  type: string,
  fileUrl: string,
  mimeType: string
) {
  try {
    if (type === "PHOTO") {
      await autoAnalyzePhoto(evidenceId, fileUrl, mimeType);
    } else if (type === "AUDIO_CHUNK") {
      await autoTranscribeAudio(evidenceId, fileUrl, mimeType);
    } else if (type === "VIDEO") {
      await autoAnnotateVideo(evidenceId, fileUrl, mimeType);
    }
  } catch (err) {
    console.error(`[auto-analyze] Failed for evidence ${evidenceId} (${type}):`, err);
  }
}

async function autoAnalyzePhoto(evidenceId: string, fileUrl: string, mimeType: string) {
  // Skip if already analyzed
  const existing = await prisma.captureEvidence.findUnique({
    where: { id: evidenceId },
    select: { aiExtraction: true },
  });
  if (existing?.aiExtraction) return;

  // Download image and convert to base64
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch photo: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString("base64");

  const result = await analyzeImageWithFallback({
    imageBase64: base64,
    mimeType,
  });

  await prisma.captureEvidence.update({
    where: { id: evidenceId },
    data: { aiExtraction: JSON.parse(JSON.stringify(result)) },
  });

  console.log(`[auto-analyze] Photo ${evidenceId} analyzed`);
}

async function autoTranscribeAudio(evidenceId: string, fileUrl: string, mimeType: string) {
  // Skip if already transcribed
  const existing = await prisma.captureEvidence.findUnique({
    where: { id: evidenceId },
    select: { transcription: true },
  });
  if (existing?.transcription) return;

  // Download audio from blob storage
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const audioBlob = new Blob([buffer], { type: mimeType });

  const result = await transcribeWithFallback(audioBlob, "audio.m4a");

  await prisma.captureEvidence.update({
    where: { id: evidenceId },
    data: {
      transcription: result.text,
      durationSeconds: result.duration || null,
    },
  });

  console.log(`[auto-analyze] Audio ${evidenceId} transcribed`);
}

async function autoAnnotateVideo(evidenceId: string, fileUrl: string, mimeType: string) {
  // Skip if already annotated
  const existingAnnotations = await prisma.videoAnnotation.findMany({
    where: { evidenceId },
    take: 1,
  });
  if (existingAnnotations.length > 0) return;

  // Download video from blob storage
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);
  const fileBuffer = Buffer.from(await response.arrayBuffer());

  // Upload to Gemini, wait for processing, annotate, clean up
  const uploadedFile = await uploadFileToGemini(
    fileBuffer,
    mimeType,
    `auto-video-${evidenceId}`
  );
  const processedFile = await waitForFileProcessing(uploadedFile.name);
  const annotations = await annotateVideoChunk(processedFile.uri, mimeType);

  // Save annotations to database
  for (const annotation of annotations) {
    await prisma.videoAnnotation.create({
      data: {
        evidenceId,
        timestamp: annotation.timestamp,
        tag: annotation.tag,
        description: annotation.description,
        confidence: clampConfidence(annotation.confidence),
      },
    });
  }

  // Clean up Gemini file
  deleteGeminiFile(uploadedFile.name).catch((err) =>
    console.warn("[auto-analyze] Failed to delete Gemini file:", err)
  );

  console.log(`[auto-analyze] Video ${evidenceId} annotated (${annotations.length} tags)`);
}
