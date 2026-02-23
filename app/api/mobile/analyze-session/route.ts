// POST /api/mobile/analyze-session — Deep video analysis (Pass 2)
// Runs after the mechanic finishes the session
// Uploads full video to Gemini File API, loads CMM context, runs Gemini 2.5 Flash
// Produces detailed action log, part identification, procedure verification
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  analyzeSessionVideo,
  deleteGeminiFile,
} from "@/lib/ai/gemini";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Load the session with all evidence
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      include: {
        evidence: {
          where: { type: "VIDEO" },
          orderBy: { capturedAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.technicianId !== auth.technician.id) {
      return NextResponse.json(
        { success: false, error: "Not authorized for this session" },
        { status: 403 }
      );
    }

    // Check if analysis already exists
    const existingAnalysis = await prisma.sessionAnalysis.findUnique({
      where: { sessionId },
    });
    if (existingAnalysis) {
      return NextResponse.json({
        success: true,
        data: {
          analysis: existingAnalysis,
          message: "Analysis already exists for this session",
        },
      });
    }

    if (session.evidence.length === 0) {
      return NextResponse.json(
        { success: false, error: "No video evidence in this session" },
        { status: 400 }
      );
    }

    // Update session status to processing
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: "processing" },
    });

    const startTime = Date.now();

    // Analyze the first/largest video chunk
    const videoEvidence = session.evidence[0];

    // Download the video file from Vercel Blob
    const fileResponse = await fetch(videoEvidence.fileUrl);
    if (!fileResponse.ok) {
      return NextResponse.json(
        { success: false, error: "Could not retrieve video file" },
        { status: 500 }
      );
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    // Step 1: Upload video to Gemini File API
    const uploadedFile = await uploadFileToGemini(
      fileBuffer,
      videoEvidence.mimeType,
      `session-${sessionId}-full`
    );

    // Step 2: Wait for processing
    const processedFile = await waitForFileProcessing(uploadedFile.name);

    // Step 3: Try to load CMM context for the identified part
    let cmmContent: string | undefined;
    if (session.componentId) {
      // Look up the component to get the part number
      const component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: { partNumber: true },
      });

      if (component) {
        // Look for a CMM matching this part number
        const cmm = await prisma.componentManual.findFirst({
          where: { partNumber: component.partNumber },
        });

        if (cmm) {
          // Load the CMM file content from URL
          try {
            const cmmResponse = await fetch(cmm.fileUrl);
            if (cmmResponse.ok) {
              cmmContent = await cmmResponse.text();
              console.log(`Loaded CMM: ${cmm.title} (${cmm.partNumber})`);
            }
          } catch (err) {
            console.warn(`Could not load CMM file: ${cmm.fileUrl}`, err);
            // Graceful degradation — proceed without CMM
          }
        }
      }
    }

    // Step 4: Run deep analysis with Gemini 2.5 Flash
    const analysis = await analyzeSessionVideo(
      processedFile.uri,
      videoEvidence.mimeType,
      cmmContent
    );

    const processingTime = Date.now() - startTime;

    // Step 5: Estimate cost
    // ~632K tokens input for 15-min video + CMM, ~2K output
    const estimatedInputTokens = cmmContent
      ? 632000 // Video + CMM
      : 232000; // Video only
    const costPerMillionInput = 0.3; // Gemini 2.5 Flash
    const costEstimate =
      (estimatedInputTokens / 1_000_000) * costPerMillionInput;

    // Step 6: Save analysis to database
    const savedAnalysis = await prisma.sessionAnalysis.create({
      data: {
        sessionId,
        actionLog: JSON.stringify(analysis.actionLog),
        partsIdentified: JSON.stringify(analysis.partsIdentified),
        procedureSteps: JSON.stringify(analysis.procedureSteps),
        anomalies: JSON.stringify(analysis.anomalies),
        confidence: analysis.confidence,
        modelUsed: process.env.VIDEO_ANALYSIS_MODEL || "gemini-2.5-flash",
        costEstimate,
        processingTime,
      },
    });

    // Step 7: Clean up Gemini file
    deleteGeminiFile(uploadedFile.name).catch((err) =>
      console.warn("Failed to delete Gemini file:", err)
    );

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "session_analyzed",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: JSON.stringify({
          model: process.env.VIDEO_ANALYSIS_MODEL || "gemini-2.5-flash",
          confidence: analysis.confidence,
          partsFound: analysis.partsIdentified.length,
          stepsIdentified: analysis.procedureSteps.length,
          anomaliesFound: analysis.anomalies.length,
          costEstimate,
          processingTime,
          hadCmmContext: !!cmmContent,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        analysis: {
          ...savedAnalysis,
          // Parse JSON fields for the response
          actionLog: analysis.actionLog,
          partsIdentified: analysis.partsIdentified,
          procedureSteps: analysis.procedureSteps,
          anomalies: analysis.anomalies,
        },
        processingTime,
        costEstimate,
        hadCmmContext: !!cmmContent,
      },
    });
  } catch (error) {
    console.error("Analyze session error:", error);
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
