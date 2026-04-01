import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  PROCESSING_STAGE_SEQUENCE,
  buildSessionProgressSnapshot,
  mapStageToUserFacingState,
  shouldPollSessionProgress,
} from "@/lib/session-progress";
import {
  runSessionAnalysisStage,
  runSessionDraftingStage,
} from "@/lib/ai/pipeline-stages";
import { verifyDocuments } from "@/lib/ai/verify";
import {
  assessEvidenceReadiness,
  clearRefreshAndProcessingSnapshot,
  getSessionPipelineState,
  setProcessingSnapshot,
} from "@/lib/session-pipeline-state";

const JOB_LEASE_MS = 2 * 60 * 1000;

function stageToLegacyStatus(stage: string): string {
  switch (stage) {
    case "queued":
      return "capture_complete";
    case "analyzing":
      return "processing";
    case "drafting":
      return "documents_generated";
    case "verifying":
      return "verified";
    case "packaging":
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "capture_complete";
  }
}

function stageToLegacyInProgressStatus(stage: string): string {
  switch (stage) {
    case "packaging":
      return "verified";
    case "analyzing":
    case "drafting":
    case "verifying":
      return "processing";
    default:
      return "capture_complete";
  }
}

export async function ensureSessionProcessingJob(
  sessionId: string,
  options?: { forceRetry?: boolean }
) {
  const forceRetry = options?.forceRetry ?? false;

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      status: true,
      completedAt: true,
      sessionType: true,
    },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  // Inspection sessions skip the processing pipeline entirely —
  // no 8130-3 generation, no work order drafting, just direct measurement capture.
  if (session.sessionType === "inspection") {
    return null;
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    let job = await tx.sessionProcessingJob.findUnique({
      where: { sessionId },
      include: { stages: true },
    });

    if (!job) {
      job = await tx.sessionProcessingJob.create({
        data: {
          sessionId,
          currentStage: "queued",
          userFacingState: "Captured",
          stages: {
            create: PROCESSING_STAGE_SEQUENCE.map((stage) => ({
              stage,
              status: "queued",
            })),
          },
        },
        include: { stages: true },
      });

      await tx.captureSession.update({
        where: { id: sessionId },
        data: {
          status: session.status === "capturing" ? "capture_complete" : session.status,
          completedAt: session.completedAt ?? now,
        },
      });

      await tx.auditLogEntry.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "session_processing_enqueued",
          entityType: "CaptureSession",
          entityId: sessionId,
          metadata: { forceRetry: false },
        },
      });

      return job;
    }

    if (forceRetry && job.currentStage === "failed") {
      const failedStage =
        job.lastErrorStage ??
        job.stages.find((stage) => stage.status === "failed")?.stage ??
        PROCESSING_STAGE_SEQUENCE[0];

      await tx.sessionProcessingStage.update({
        where: {
          jobId_stage: {
            jobId: job.id,
            stage: failedStage,
          },
        },
        data: {
          status: "queued",
          startedAt: null,
          completedAt: null,
          lastError: null,
          errorMetadata: Prisma.DbNull,
          latencyMs: null,
        },
      });

      await tx.sessionProcessingJob.update({
        where: { id: job.id },
        data: {
          currentStage: failedStage,
          userFacingState: mapStageToUserFacingState(failedStage) ?? "Captured",
          completedAt: null,
          failedAt: null,
          lastError: null,
          lastErrorStage: null,
          runnerToken: null,
          leaseExpiresAt: null,
        },
      });

      await tx.captureSession.update({
        where: { id: sessionId },
        data: { status: stageToLegacyStatus(failedStage) },
      });

      await tx.auditLogEntry.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "session_processing_retried",
          entityType: "CaptureSession",
          entityId: sessionId,
          metadata: { failedStage },
        },
      });

      job = await tx.sessionProcessingJob.findUnique({
        where: { id: job.id },
        include: { stages: true },
      });
    }

    if (!job) {
      throw new Error("Session processing job disappeared");
    }

    return job;
  });
}

export function scheduleSessionProcessing(jobId: string) {
  try {
    after(() => processSessionProcessingJob(jobId));
  } catch {
    void processSessionProcessingJob(jobId);
  }
}

export async function scheduleSessionProcessingIfNeeded(session: {
  status: string;
  processingJob?: {
    id: string;
    currentStage: string;
    userFacingState?: string | null;
    queuedAt?: Date | string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    failedAt?: Date | string | null;
    lastError?: string | null;
    lastErrorStage?: string | null;
    stages?: Array<{
      stage: string;
      status: string;
      attemptCount: number;
      startedAt: Date | string | null;
      completedAt: Date | string | null;
      lastError: string | null;
      errorMetadata: unknown;
      latencyMs: number | null;
    }>;
    leaseExpiresAt?: Date | null;
  } | null;
  packages?: Array<{
    id: string;
    packageType: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  if (!session.processingJob) return;

  const progress = buildSessionProgressSnapshot({
    session,
    job: session.processingJob,
    packageArtifact: session.packages?.[0] ?? null,
  });

  const leaseExpired =
    !session.processingJob.leaseExpiresAt ||
    session.processingJob.leaseExpiresAt.getTime() < Date.now();

  if (progress && shouldPollSessionProgress(progress) && leaseExpired) {
    scheduleSessionProcessing(session.processingJob.id);
  }
}

async function ensureActiveProcessingSnapshot(sessionId: string, summary: unknown) {
  const pipelineState = getSessionPipelineState(summary);
  if (
    pipelineState.activeSnapshot &&
    pipelineState.activeSnapshot.evidenceIds.length > 0
  ) {
    return {
      ready: true,
      snapshot: pipelineState.activeSnapshot,
      pendingEvidenceIds: [] as string[],
    };
  }

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      completedAt: true,
      reconciliationSummary: true,
      evidence: {
        orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          capturedAt: true,
          createdAt: true,
          aiExtraction: true,
          transcription: true,
          _count: {
            select: {
              videoAnnotations: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("Session not found while checking evidence readiness");
  }

  const readiness = assessEvidenceReadiness({
    evidence: session.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      capturedAt: item.capturedAt,
      createdAt: item.createdAt,
      aiExtraction: item.aiExtraction,
      transcription: item.transcription,
      videoAnnotationCount: item._count.videoAnnotations,
    })),
    summary: session.reconciliationSummary,
    completedAt: session.completedAt,
  });

  if (!readiness.ready) {
    return readiness;
  }

  await setProcessingSnapshot(sessionId, readiness.snapshot);

  return {
    ready: true,
    snapshot: readiness.snapshot,
    pendingEvidenceIds: [] as string[],
  };
}

async function resetJobForPipelineRefresh(jobId: string, sessionId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.sessionAnalysis.deleteMany({
      where: { sessionId },
    });

    await tx.captureDocument.deleteMany({
      where: { sessionId },
    });

    await tx.sessionPackage.deleteMany({
      where: { sessionId },
    });

    await tx.sessionProcessingStage.updateMany({
      where: {
        jobId,
        stage: { in: [...PROCESSING_STAGE_SEQUENCE] },
      },
      data: {
        status: "queued",
        startedAt: null,
        completedAt: null,
        lastError: null,
        errorMetadata: Prisma.DbNull,
        latencyMs: null,
      },
    });

    await tx.sessionProcessingJob.update({
      where: { id: jobId },
      data: {
        currentStage: "queued",
        userFacingState: "Captured",
        startedAt: null,
        completedAt: null,
        failedAt: null,
        lastError: null,
        lastErrorStage: null,
        runnerToken: null,
        leaseExpiresAt: null,
      },
    });

    await tx.captureSession.update({
      where: { id: sessionId },
      data: {
        status: "capture_complete",
      },
    });
  });

  await clearRefreshAndProcessingSnapshot(sessionId);
}

async function prepareTerminalJobForRefresh(jobId: string) {
  const job = await prisma.sessionProcessingJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      currentStage: true,
      sessionId: true,
      session: {
        select: {
          reconciliationSummary: true,
        },
      },
    },
  });

  if (!job) return;
  if (job.currentStage !== "completed" && job.currentStage !== "failed") return;

  const pipelineState = getSessionPipelineState(job.session.reconciliationSummary);
  if (!pipelineState.needsRefresh) return;

  await resetJobForPipelineRefresh(jobId, job.sessionId);
}

async function processSessionProcessingJob(jobId: string) {
  await prepareTerminalJobForRefresh(jobId);
  const runnerToken = await acquireJobLease(jobId);
  if (!runnerToken) return;

  try {
    while (true) {
      const job = await prisma.sessionProcessingJob.findUnique({
        where: { id: jobId },
        include: {
          session: {
            select: {
              id: true,
              status: true,
              userId: true,
              organizationId: true,
              completedAt: true,
              reconciliationSummary: true,
            },
          },
          stages: true,
        },
      });

      if (!job) return;
      if (job.currentStage === "completed" || job.currentStage === "failed") return;
      if (job.session.status === "cancelled") return;

      const pipelineState = getSessionPipelineState(
        job.session.reconciliationSummary
      );
      if (pipelineState.needsRefresh) {
        await resetJobForPipelineRefresh(jobId, job.session.id);
        scheduleSessionProcessing(jobId);
        return;
      }

      const nextStage = PROCESSING_STAGE_SEQUENCE.find((stage) => {
        const record = job.stages.find((entry) => entry.stage === stage);
        return record?.status !== "completed";
      });

      if (!nextStage) {
        await prisma.sessionProcessingJob.update({
          where: { id: jobId },
          data: {
            currentStage: "completed",
            userFacingState: "Packaged",
            completedAt: new Date(),
            runnerToken: null,
            leaseExpiresAt: null,
          },
        });

        await prisma.captureSession.update({
          where: { id: job.session.id },
          data: { status: "completed" },
        });
        return;
      }

      const snapshotReadiness = await ensureActiveProcessingSnapshot(
        job.session.id,
        job.session.reconciliationSummary
      );
      if (!snapshotReadiness.ready) {
        console.log(
          `[Pipeline] Waiting on evidence analysis for session ${job.session.id}: ${snapshotReadiness.pendingEvidenceIds.join(", ")}`
        );
        return;
      }

      const evidenceIds = snapshotReadiness.snapshot.evidenceIds;
      const attemptCount = await markStageInProgress(jobId, nextStage, job.session.id);
      const stageStart = Date.now();

      try {
        if (nextStage === "analyzing") {
          const analysisResult = await runSessionAnalysisStage(job.session.id, {
            evidenceIds,
          });
          if (
            !analysisResult.transcriptionStitch.success &&
            !analysisResult.videoAnalysis.success
          ) {
            throw new Error(
              analysisResult.videoAnalysis.error ??
                analysisResult.transcriptionStitch.error ??
                "Analysis stage failed"
            );
          }

          await markStageCompleted({
            jobId,
            sessionId: job.session.id,
            stage: nextStage,
            latencyMs: Date.now() - stageStart,
            metadata: {
              transcriptChunks: analysisResult.transcriptionStitch.chunkCount,
              videoConfidence: analysisResult.videoAnalysis.confidence ?? null,
              processingTimeMs: analysisResult.processingTimeMs,
              warnings: analysisResult.warnings,
              evidenceSnapshot: evidenceIds,
            },
            legacyStatus: "analysis_complete",
          });

          // Store analysis warnings on the session's reconciliationSummary
          if (analysisResult.warnings.length > 0) {
            await prisma.captureSession.update({
              where: { id: job.session.id },
              data: {
                reconciliationSummary: {
                  analysisWarnings: analysisResult.warnings,
                },
              },
            });
          }
        } else if (nextStage === "drafting") {
          const draftingResult = await runSessionDraftingStage(job.session.id, {
            evidenceIds,
          });
          if (!draftingResult.success) {
            throw new Error(draftingResult.error ?? "Drafting stage failed");
          }

          await markStageCompleted({
            jobId,
            sessionId: job.session.id,
            stage: nextStage,
            latencyMs: Date.now() - stageStart,
            metadata: {
              documentCount: draftingResult.documentCount,
              documentTypes: draftingResult.documentTypes,
              estimatedCost: draftingResult.estimatedCost,
              warnings: draftingResult.warnings,
              evidenceSnapshot: evidenceIds,
            },
            legacyStatus: "documents_generated",
          });

          // Append drafting warnings to the session's reconciliationSummary
          if (draftingResult.warnings.length > 0) {
            const existing = await prisma.captureSession.findUnique({
              where: { id: job.session.id },
              select: { reconciliationSummary: true },
            });
            const prev = (existing?.reconciliationSummary as Record<string, unknown>) ?? {};
            await prisma.captureSession.update({
              where: { id: job.session.id },
              data: {
                reconciliationSummary: {
                  ...prev,
                  draftingWarnings: draftingResult.warnings,
                },
              },
            });
          }
        } else if (nextStage === "verifying") {
          const verificationResult = await verifyDocuments(
            job.session.id,
            job.session.userId,
            { evidenceIds }
          );

          await markStageCompleted({
            jobId,
            sessionId: job.session.id,
            stage: nextStage,
            latencyMs: Date.now() - stageStart,
            metadata: {
              ...verificationResult,
              evidenceSnapshot: evidenceIds,
            },
            legacyStatus: "verified",
          });
        } else if (nextStage === "packaging") {
          const packageRecord = await buildSessionPackage(job.session.id, evidenceIds);

          await markStageCompleted({
            jobId,
            sessionId: job.session.id,
            stage: nextStage,
            latencyMs: Date.now() - stageStart,
            metadata: {
              packageId: packageRecord.id,
              packageType: packageRecord.packageType,
              evidenceSnapshot: evidenceIds,
            },
            legacyStatus: "completed",
          });

          await prisma.sessionProcessingJob.update({
            where: { id: jobId },
            data: {
              currentStage: "completed",
              userFacingState: "Packaged",
              completedAt: new Date(),
            },
          });
        }
      } catch (error) {
        const MAX_ATTEMPTS = 3;

        if (attemptCount < MAX_ATTEMPTS) {
          // Exponential backoff: 4^attempt * 1000ms (4s, 16s, 64s)
          const delayMs = Math.pow(4, attemptCount) * 1000;
          console.log(
            `[Pipeline] Retrying stage "${nextStage}" (attempt ${attemptCount}/${MAX_ATTEMPTS}, delay ${delayMs}ms): ${error instanceof Error ? error.message : "unknown error"}`
          );

          // Wait with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          // Refresh the job lease so it doesn't expire during the retry
          await refreshJobLease(jobId, runnerToken);

          // Continue the while loop to re-enter markStageInProgress (which increments attemptCount)
          continue;
        }

        // All retry attempts exhausted — mark as failed
        console.log(
          `[Pipeline] Stage "${nextStage}" failed after ${attemptCount} attempts: ${error instanceof Error ? error.message : "unknown error"}`
        );
        await markStageFailed({
          jobId,
          sessionId: job.session.id,
          stage: nextStage,
          error:
            error instanceof Error ? error.message : "Background processing failed",
          latencyMs: Date.now() - stageStart,
        });
        return;
      }

      await refreshJobLease(jobId, runnerToken);
    }
  } finally {
    await releaseJobLease(jobId, runnerToken);
  }
}

async function acquireJobLease(jobId: string) {
  const runnerToken = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + JOB_LEASE_MS);

  const result = await prisma.sessionProcessingJob.updateMany({
    where: {
      id: jobId,
      currentStage: {
        notIn: ["completed", "failed"],
      },
      OR: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      runnerToken,
      leaseExpiresAt,
    },
  });

  return result.count > 0 ? runnerToken : null;
}

async function refreshJobLease(jobId: string, runnerToken: string) {
  await prisma.sessionProcessingJob.updateMany({
    where: { id: jobId, runnerToken },
    data: {
      leaseExpiresAt: new Date(Date.now() + JOB_LEASE_MS),
    },
  });
}

async function releaseJobLease(jobId: string, runnerToken: string) {
  await prisma.sessionProcessingJob.updateMany({
    where: { id: jobId, runnerToken },
    data: {
      runnerToken: null,
      leaseExpiresAt: null,
    },
  });
}

async function markStageInProgress(
  jobId: string,
  stage: string,
  sessionId: string
): Promise<number> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updatedStage = await tx.sessionProcessingStage.update({
      where: { jobId_stage: { jobId, stage } },
      data: {
        status: "in_progress",
        attemptCount: { increment: 1 },
        startedAt: now,
        lastError: null,
        errorMetadata: Prisma.DbNull,
      },
    });

    await tx.sessionProcessingJob.update({
      where: { id: jobId },
      data: {
        currentStage: stage,
        userFacingState: mapStageToUserFacingState(stage) ?? "Captured",
        startedAt: now,
        lastError: null,
        lastErrorStage: null,
      },
    });

    await tx.captureSession.update({
      where: { id: sessionId },
      data: { status: stageToLegacyInProgressStatus(stage) },
    });

    return updatedStage.attemptCount;
  });
}

async function markStageCompleted(args: {
  jobId: string;
  sessionId: string;
  stage: string;
  latencyMs: number;
  metadata: unknown;
  legacyStatus: string;
}) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.sessionProcessingStage.update({
      where: { jobId_stage: { jobId: args.jobId, stage: args.stage } },
      data: {
        status: "completed",
        completedAt: now,
        latencyMs: args.latencyMs,
        errorMetadata: args.metadata ? (args.metadata as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    await tx.sessionProcessingJob.update({
      where: { id: args.jobId },
      data: {
        currentStage: args.stage,
        userFacingState: mapStageToUserFacingState(args.stage) ?? "Captured",
      },
    });

    await tx.captureSession.update({
      where: { id: args.sessionId },
      data: { status: args.legacyStatus },
    });

    const session = await tx.captureSession.findUnique({
      where: { id: args.sessionId },
      select: { userId: true, organizationId: true },
    });

    if (session) {
      await tx.auditLogEntry.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: `session_stage_${args.stage}_completed`,
          entityType: "CaptureSession",
          entityId: args.sessionId,
          metadata: {
            latencyMs: args.latencyMs,
            ...((typeof args.metadata === "object" && args.metadata) || {}),
          },
        },
      });
    }
  });
}

async function markStageFailed(args: {
  jobId: string;
  sessionId: string;
  stage: string;
  error: string;
  latencyMs: number;
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.sessionProcessingStage.update({
      where: { jobId_stage: { jobId: args.jobId, stage: args.stage } },
      data: {
        status: "failed",
        lastError: args.error,
        errorMetadata: {
          failedAt: now.toISOString(),
          latencyMs: args.latencyMs,
        },
        latencyMs: args.latencyMs,
      },
    });

    await tx.sessionProcessingJob.update({
      where: { id: args.jobId },
      data: {
        currentStage: "failed",
        userFacingState: mapStageToUserFacingState(args.stage) ?? "Captured",
        failedAt: now,
        lastError: args.error,
        lastErrorStage: args.stage,
      },
    });

    await tx.captureSession.update({
      where: { id: args.sessionId },
      data: { status: "failed" },
    });

    const session = await tx.captureSession.findUnique({
      where: { id: args.sessionId },
      select: { userId: true, organizationId: true },
    });

    if (session) {
      await tx.auditLogEntry.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: `session_stage_${args.stage}_failed`,
          entityType: "CaptureSession",
          entityId: args.sessionId,
          metadata: {
            latencyMs: args.latencyMs,
            error: args.error,
          },
        },
      });
    }
  });
}

async function buildSessionPackage(sessionId: string, evidenceIds?: string[]) {
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    include: {
      evidence: {
        where: evidenceIds ? { id: { in: evidenceIds } } : undefined,
        select: {
          id: true,
          type: true,
          fileUrl: true,
          capturedAt: true,
        },
      },
      documents: {
        select: {
          id: true,
          documentType: true,
          status: true,
          generatedAt: true,
          verifiedAt: true,
        },
      },
      processingJob: {
        include: {
          stages: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("Session not found while packaging");
  }

  const manifest = {
    sessionId,
    packagedAt: new Date().toISOString(),
    evidenceSnapshot: evidenceIds ?? session.evidence.map((item) => item.id),
    evidenceCount: session.evidence.length,
    documentCount: session.documents.length,
    documents: session.documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      generatedAt: doc.generatedAt,
      verifiedAt: doc.verifiedAt,
    })),
    evidence: session.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      fileUrl: item.fileUrl,
      capturedAt: item.capturedAt,
    })),
    stages:
      session.processingJob?.stages.map((stage) => ({
        stage: stage.stage,
        status: stage.status,
        attemptCount: stage.attemptCount,
        startedAt: stage.startedAt,
        completedAt: stage.completedAt,
      })) ?? [],
  };

  return prisma.sessionPackage.upsert({
    where: { sessionId },
    create: {
      sessionId,
      manifestJson: manifest,
    },
    update: {
      manifestJson: manifest,
      status: "ready",
    },
  });
}
