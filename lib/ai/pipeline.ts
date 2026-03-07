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
  runSessionAnalysisStage,
  runSessionDraftingStage,
} from "./pipeline-stages";

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

  const analysisResult = await runSessionAnalysisStage(sessionId);
  result.steps.transcriptionStitch = analysisResult.transcriptionStitch;
  result.steps.videoAnalysis = analysisResult.videoAnalysis;

  const draftingResult = await runSessionDraftingStage(sessionId);
  estimatedCost += draftingResult.estimatedCost;
  result.steps.documentGeneration = {
    success: draftingResult.success,
    error: draftingResult.error,
    documentCount: draftingResult.documentCount,
    documentTypes: draftingResult.documentTypes,
  };

  // Finalize
  result.totalTimeMs = Date.now() - pipelineStart;
  result.estimatedCost = estimatedCost;

  // Ensure the session never gets stuck in "processing" on partial failures.
  const finalStatus = result.steps.documentGeneration.success
    ? "documents_generated"
    : result.steps.videoAnalysis.success || result.steps.transcriptionStitch.success
    ? "analysis_complete"
    : "capture_complete";
  await prisma.captureSession.update({
    where: { id: sessionId },
    data: { status: finalStatus },
  });

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
