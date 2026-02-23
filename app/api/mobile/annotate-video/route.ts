// POST /api/mobile/annotate-video — Real-time video annotation (Pass 1)
// Takes a 2-minute video chunk, uploads to Gemini File API, runs Gemini 2.0 Flash
// Returns timestamped searchable tags (part numbers, actions, tools, text)
// Called automatically after each video chunk upload during capture
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  annotateVideoChunk,
  deleteGeminiFile,
} from "@/lib/ai/gemini";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { evidenceId } = body;

    if (!evidenceId) {
      return NextResponse.json(
        { success: false, error: "evidenceId is required" },
        { status: 400 }
      );
    }

    // Look up the evidence record to get the video file
    const evidence = await prisma.captureEvidence.findUnique({
      where: { id: evidenceId },
      include: { session: true },
    });

    if (!evidence) {
      return NextResponse.json(
        { success: false, error: "Evidence not found" },
        { status: 404 }
      );
    }

    if (evidence.session.technicianId !== auth.technician.id) {
      return NextResponse.json(
        { success: false, error: "Not authorized for this evidence" },
        { status: 403 }
      );
    }

    if (evidence.type !== "VIDEO") {
      return NextResponse.json(
        { success: false, error: "Evidence must be a video" },
        { status: 400 }
      );
    }

    // Download the video file from Vercel Blob
    const fileResponse = await fetch(evidence.fileUrl);
    if (!fileResponse.ok) {
      return NextResponse.json(
        { success: false, error: "Could not retrieve video file" },
        { status: 500 }
      );
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    const startTime = Date.now();

    // Step 1: Upload video to Gemini File API
    const uploadedFile = await uploadFileToGemini(
      fileBuffer,
      evidence.mimeType,
      `video-chunk-${evidenceId}`
    );

    // Step 2: Wait for Gemini to process the video
    const processedFile = await waitForFileProcessing(uploadedFile.name);

    // Step 3: Run annotation with Gemini 2.0 Flash
    const annotations = await annotateVideoChunk(
      processedFile.uri,
      evidence.mimeType
    );

    const latencyMs = Date.now() - startTime;

    // Step 4: Save annotations to database
    const savedAnnotations = [];
    for (const annotation of annotations) {
      const saved = await prisma.videoAnnotation.create({
        data: {
          evidenceId,
          timestamp: annotation.timestamp,
          tag: annotation.tag,
          description: annotation.description,
          confidence: annotation.confidence,
        },
      });
      savedAnnotations.push(saved);
    }

    // Step 5: Clean up the file from Gemini (don't leave files hanging around)
    deleteGeminiFile(uploadedFile.name).catch((err) =>
      console.warn("Failed to delete Gemini file:", err)
    );

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "video_annotated",
        entityType: "CaptureEvidence",
        entityId: evidenceId,
        metadata: JSON.stringify({
          model: process.env.VIDEO_ANNOTATION_MODEL || "gemini-2.0-flash",
          annotationCount: savedAnnotations.length,
          latencyMs,
          tags: savedAnnotations.map((a) => a.tag),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        annotations: savedAnnotations,
        annotationCount: savedAnnotations.length,
        latencyMs,
      },
    });
  } catch (error) {
    console.error("Annotate video error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Video annotation failed",
      },
      { status: 500 }
    );
  }
}
