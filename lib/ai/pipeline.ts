// AI Processing Pipeline — orchestrates the full post-session processing
// Called when a mechanic finishes a capture session
// Runs these steps in order:
// 1. Stitch audio transcripts into full session transcript
// 2. Deep video analysis (Gemini 2.5 Flash + CMM context)
// 3. Generate FAA compliance documents (GPT-4o)
//
// Each step is independent enough that a failure in one doesn't block the others.
// The pipeline updates session status as it progresses.

import { prisma } from "@/lib/db";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  analyzeSessionVideo,
  deleteGeminiFile,
} from "./gemini";
import { generateDocuments } from "./openai";
import { readFile } from "fs/promises";
import path from "path";

export interface PipelineResult {
  sessionId: string;
  steps: {
    transcriptionStitch: { success: boolean; error?: string; chunkCount: number };
    videoAnalysis: { success: boolean; error?: string; confidence?: number };
    documentGeneration: {
      success: boolean;
      error?: string;
      documentCount: number;
      documentTypes: string[];
    };
  };
  totalTimeMs: number;
  estimatedCost: number;
}

// ──────────────────────────────────────────────────────
// Run the full pipeline for a completed session
// This is the main entry point — called by the analyze-session endpoint
// or could be triggered by a background job
// ──────────────────────────────────────────────────────
export async function runSessionPipeline(
  sessionId: string,
  technicianId: string,
  organizationId: string
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  let estimatedCost = 0;

  const result: PipelineResult = {
    sessionId,
    steps: {
      transcriptionStitch: { success: false, chunkCount: 0 },
      videoAnalysis: { success: false },
      documentGeneration: { success: false, documentCount: 0, documentTypes: [] },
    },
    totalTimeMs: 0,
    estimatedCost: 0,
  };

  // Update session status to processing
  await prisma.captureSession.update({
    where: { id: sessionId },
    data: { status: "processing" },
  });

  // Load the session with all evidence
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    include: {
      evidence: { orderBy: { capturedAt: "asc" } },
      technician: true,
      organization: true,
    },
  });

  if (!session) throw new Error(`Session not found: ${sessionId}`);

  // ── Step 1: Stitch audio transcripts ──────────────────

  try {
    const audioChunks = session.evidence.filter(
      (e) => e.type === "AUDIO_CHUNK" && e.transcription
    );

    if (audioChunks.length > 0) {
      // Build full transcript with time markers
      const fullTranscript = audioChunks
        .map((chunk, i) => {
          const timeOffset = i * 120; // Each chunk is ~2 min
          const minutes = Math.floor(timeOffset / 60);
          const seconds = timeOffset % 60;
          const marker = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
          return `${marker} ${chunk.transcription}`;
        })
        .join("\n");

      // Store the stitched transcript on the session
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { description: fullTranscript },
      });

      result.steps.transcriptionStitch = {
        success: true,
        chunkCount: audioChunks.length,
      };
    } else {
      result.steps.transcriptionStitch = {
        success: true,
        chunkCount: 0,
      };
    }
  } catch (error) {
    result.steps.transcriptionStitch = {
      success: false,
      chunkCount: 0,
      error: error instanceof Error ? error.message : "Transcript stitching failed",
    };
    console.error("Pipeline: transcript stitching failed:", error);
  }

  // ── Step 2: Deep video analysis ──────────────────

  try {
    const videoEvidence = session.evidence.filter((e) => e.type === "VIDEO");

    if (videoEvidence.length > 0) {
      // Check if analysis already exists
      const existingAnalysis = await prisma.sessionAnalysis.findUnique({
        where: { sessionId },
      });

      if (!existingAnalysis) {
        // Use the first/largest video
        const video = videoEvidence[0];
        const filePath = path.join(process.cwd(), "public", video.fileUrl);
        const fileBuffer = await readFile(filePath);

        // Upload to Gemini
        const uploadedFile = await uploadFileToGemini(
          fileBuffer,
          video.mimeType,
          `pipeline-${sessionId}`
        );
        const processedFile = await waitForFileProcessing(uploadedFile.name);

        // Try to load CMM context
        let cmmContent: string | undefined;
        if (session.componentId) {
          const component = await prisma.component.findUnique({
            where: { id: session.componentId },
            select: { partNumber: true },
          });
          if (component) {
            const cmm = await prisma.componentManual.findFirst({
              where: { partNumber: component.partNumber },
            });
            if (cmm) {
              try {
                const cmmPath = cmm.fileUrl.startsWith("/")
                  ? path.join(process.cwd(), "public", cmm.fileUrl)
                  : cmm.fileUrl;
                cmmContent = await readFile(cmmPath, "utf-8");
              } catch {
                console.warn("Pipeline: Could not load CMM file");
              }
            }
          }
        }

        // Run analysis
        const analysis = await analyzeSessionVideo(
          processedFile.uri,
          video.mimeType,
          cmmContent
        );

        // Estimate cost
        const inputTokens = cmmContent ? 632000 : 232000;
        const analysisCost = (inputTokens / 1_000_000) * 0.3;
        estimatedCost += analysisCost;

        // Save to database
        await prisma.sessionAnalysis.create({
          data: {
            sessionId,
            actionLog: JSON.stringify(analysis.actionLog),
            partsIdentified: JSON.stringify(analysis.partsIdentified),
            procedureSteps: JSON.stringify(analysis.procedureSteps),
            anomalies: JSON.stringify(analysis.anomalies),
            confidence: analysis.confidence,
            modelUsed: process.env.VIDEO_ANALYSIS_MODEL || "gemini-2.5-flash",
            costEstimate: analysisCost,
            processingTime: Date.now() - pipelineStart,
          },
        });

        // Clean up
        deleteGeminiFile(uploadedFile.name).catch(() => {});

        result.steps.videoAnalysis = {
          success: true,
          confidence: analysis.confidence,
        };
      } else {
        result.steps.videoAnalysis = {
          success: true,
          confidence: existingAnalysis.confidence,
        };
      }
    } else {
      result.steps.videoAnalysis = {
        success: true,
        // No video to analyze — that's OK, other evidence still works
      };
    }
  } catch (error) {
    result.steps.videoAnalysis = {
      success: false,
      error: error instanceof Error ? error.message : "Video analysis failed",
    };
    console.error("Pipeline: video analysis failed:", error);
    // Don't throw — continue to document generation
  }

  // ── Step 3: Generate FAA documents ──────────────────

  try {
    // Re-load session with analysis (it may have been created in step 2)
    const updatedSession = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      include: {
        evidence: { orderBy: { capturedAt: "asc" } },
        technician: true,
        organization: true,
        analysis: true,
      },
    });

    if (!updatedSession) throw new Error("Session disappeared during pipeline");

    // Gather all evidence
    const photoExtractions = updatedSession.evidence
      .filter((e) => e.type === "PHOTO" && e.aiExtraction)
      .map((e) => {
        try {
          return JSON.parse(e.aiExtraction!);
        } catch {
          return { raw: e.aiExtraction };
        }
      });

    let videoAnalysis: Record<string, unknown> | null = null;
    if (updatedSession.analysis) {
      videoAnalysis = {
        actionLog: JSON.parse(updatedSession.analysis.actionLog),
        partsIdentified: JSON.parse(updatedSession.analysis.partsIdentified),
        procedureSteps: JSON.parse(updatedSession.analysis.procedureSteps),
        anomalies: JSON.parse(updatedSession.analysis.anomalies),
      };
    }

    const audioChunks = updatedSession.evidence
      .filter((e) => e.type === "AUDIO_CHUNK" && e.transcription)
      .map((e) => e.transcription!);
    const audioTranscript = audioChunks.length > 0 ? audioChunks.join("\n") : null;

    let componentInfo: {
      partNumber: string;
      serialNumber: string;
      description: string;
      oem: string;
      totalHours: number;
      totalCycles: number;
    } | null = null;

    if (updatedSession.componentId) {
      const component = await prisma.component.findUnique({
        where: { id: updatedSession.componentId },
        select: {
          partNumber: true,
          serialNumber: true,
          description: true,
          oem: true,
          totalHours: true,
          totalCycles: true,
        },
      });
      if (component) componentInfo = component;
    }

    let cmmReference: string | null = null;
    if (componentInfo) {
      const cmm = await prisma.componentManual.findFirst({
        where: { partNumber: componentInfo.partNumber },
        select: { title: true, partNumber: true },
      });
      if (cmm) {
        cmmReference = `CMM: ${cmm.title} (P/N: ${cmm.partNumber})`;
      }
    }

    // Generate documents
    const generated = await generateDocuments({
      organizationName: updatedSession.organization.name,
      organizationCert: updatedSession.organization.faaRepairStationCert,
      organizationAddress: [
        updatedSession.organization.address,
        updatedSession.organization.city,
        updatedSession.organization.state,
        updatedSession.organization.zip,
      ]
        .filter(Boolean)
        .join(", "),
      technicianName: `${updatedSession.technician.firstName} ${updatedSession.technician.lastName}`,
      technicianBadge: updatedSession.technician.badgeNumber,
      componentInfo,
      photoExtractions,
      videoAnalysis,
      audioTranscript,
      cmmReference,
      referenceData: null, // Pipeline doesn't use reference data yet
    });

    // Estimate cost (~10K input, ~4K output for GPT-4o)
    const docCost = 0.065 * (generated.documents?.length || 1);
    estimatedCost += docCost;

    // Save documents
    const savedTypes: string[] = [];
    for (const doc of generated.documents || []) {
      await prisma.documentGeneration2.create({
        data: {
          sessionId,
          documentType: doc.documentType,
          contentJson: JSON.stringify(doc.contentJson),
          status: "draft",
          confidence: doc.confidence || 0,
          lowConfidenceFields: JSON.stringify(doc.lowConfidenceFields || []),
        },
      });
      savedTypes.push(doc.documentType);
    }

    // Update session status
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: "documents_generated" },
    });

    result.steps.documentGeneration = {
      success: true,
      documentCount: savedTypes.length,
      documentTypes: savedTypes,
    };
  } catch (error) {
    result.steps.documentGeneration = {
      success: false,
      documentCount: 0,
      documentTypes: [],
      error: error instanceof Error ? error.message : "Document generation failed",
    };
    console.error("Pipeline: document generation failed:", error);
  }

  // Finalize
  result.totalTimeMs = Date.now() - pipelineStart;
  result.estimatedCost = estimatedCost;

  // Log the full pipeline run
  await prisma.auditLogEntry.create({
    data: {
      organizationId,
      technicianId,
      action: "pipeline_completed",
      entityType: "CaptureSession",
      entityId: sessionId,
      metadata: JSON.stringify(result),
    },
  });

  return result;
}
