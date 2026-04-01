import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { isAllowedEvidenceUrl } from "@/lib/evidence-url";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  analyzeSessionVideo,
  analyzeVideoChunksMapReduce,
  deleteGeminiFile,
} from "./gemini";
import { buildVideoChunkOffsets } from "@/lib/video-timestamp-offsets";
import { generateDocuments } from "./openai";
import { clampConfidence } from "./utils";
import { getReferenceDataForPart, formatReferenceDataForPrompt } from "@/lib/reference-data";
import { reconcileSessionMeasurements } from "./measurement-extraction";
import { extractOrgDocumentFields } from "./org-document-extraction";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export interface AnalysisStageResult {
  transcriptionStitch: { success: boolean; error?: string; chunkCount: number };
  videoAnalysis: { success: boolean; error?: string; confidence?: number };
  processingTimeMs: number;
}

export interface DraftingStageResult {
  success: boolean;
  error?: string;
  documentCount: number;
  documentTypes: string[];
  estimatedCost: number;
}

export async function runSessionAnalysisStage(
  sessionId: string
): Promise<AnalysisStageResult> {
  const stageStart = Date.now();
  const result: AnalysisStageResult = {
    transcriptionStitch: { success: false, chunkCount: 0 },
    videoAnalysis: { success: false },
    processingTimeMs: 0,
  };

  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    include: {
      evidence: { orderBy: { capturedAt: "asc" } },
      user: true,
      organization: true,
    },
  });

  if (!session) throw new Error(`Session not found: ${sessionId}`);

  try {
    const audioChunks = session.evidence.filter(
      (e) => e.type === "AUDIO_CHUNK" && e.transcription
    );

    if (audioChunks.length > 0) {
      let cumulativeSeconds = 0;
      const fullTranscript = audioChunks
        .map((chunk) => {
          const minutes = Math.floor(cumulativeSeconds / 60);
          const seconds = Math.floor(cumulativeSeconds % 60);
          const marker = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
          cumulativeSeconds += chunk.durationSeconds ?? 120;
          return `${marker} ${chunk.transcription}`;
        })
        .join("\n");

      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { description: fullTranscript },
      });

      // Reconcile measurements against the full stitched transcript.
      // This catches measurements missed or mislabeled during chunk-by-chunk
      // extraction (e.g., labels split across chunk boundaries, compound values).
      try {
        const reconciled = await reconcileSessionMeasurements(sessionId, fullTranscript);
        console.log(
          `[Pipeline] Measurement reconciliation: added=${reconciled.added}, renamed=${reconciled.renamed}, skipped=${reconciled.skipped}`
        );
      } catch (reconcileError) {
        console.error("[Pipeline] Measurement reconciliation failed (non-fatal):", reconcileError);
      }

      result.transcriptionStitch = {
        success: true,
        chunkCount: audioChunks.length,
      };
    } else {
      result.transcriptionStitch = {
        success: true,
        chunkCount: 0,
      };
    }
  } catch (error) {
    result.transcriptionStitch = {
      success: false,
      chunkCount: 0,
      error: error instanceof Error ? error.message : "Transcript stitching failed",
    };
    console.error("Pipeline analysis: transcript stitching failed:", error);
  }

  try {
    const videoEvidence = session.evidence.filter((e) => e.type === "VIDEO");

    if (videoEvidence.length > 0) {
      const existingAnalysis = await prisma.sessionAnalysis.findUnique({
        where: { sessionId },
      });

      if (!existingAnalysis) {
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
              cmmContent = `CMM Reference: ${cmm.title} (Part Number: ${cmm.partNumber})`;
            }
          }
        }

        // Upload all video chunks in parallel
        const chunkOffsets = buildVideoChunkOffsets(
          videoEvidence.map((e) => ({ id: e.id, durationSeconds: e.durationSeconds }))
        );
        const uploadedFileNames: string[] = [];

        const uploadResults = await Promise.allSettled(
          videoEvidence.map(async (ev) => {
            if (!isAllowedEvidenceUrl(ev.fileUrl)) {
              throw new Error("Video evidence URL host is not allowed");
            }
            const videoResponse = await fetch(ev.fileUrl);
            if (!videoResponse.ok) {
              throw new Error(`Could not download video (status ${videoResponse.status})`);
            }
            const fileBuffer = Buffer.from(await videoResponse.arrayBuffer());
            const uploaded = await uploadFileToGemini(fileBuffer, ev.mimeType, `pipeline-${sessionId}-${ev.id}`);
            uploadedFileNames.push(uploaded.name);
            const processed = await waitForFileProcessing(uploaded.name);
            return {
              evidenceId: ev.id,
              fileUri: processed.uri,
              mimeType: ev.mimeType,
              offsetSeconds: chunkOffsets.get(ev.id) ?? 0,
            };
          })
        );

        const readyChunks: Array<{ evidenceId: string; fileUri: string; mimeType: string; offsetSeconds: number }> = [];
        for (const r of uploadResults) {
          if (r.status === "fulfilled") readyChunks.push(r.value);
        }

        if (readyChunks.length === 0) {
          throw new Error("All video chunk uploads failed");
        }

        const mrResult = await analyzeVideoChunksMapReduce(readyChunks, cmmContent);

        await prisma.sessionAnalysis.create({
          data: {
            sessionId,
            actionLog: mrResult.result.actionLog,
            partsIdentified: mrResult.result.partsIdentified,
            procedureSteps: mrResult.result.procedureSteps,
            anomalies: mrResult.result.anomalies,
            confidence: clampConfidence(mrResult.result.confidence),
            modelUsed: mrResult.mergeModel,
            costEstimate: null,
            processingTime: Date.now() - stageStart,
          },
        });

        for (const name of uploadedFileNames) {
          deleteGeminiFile(name).catch(() => {});
        }

        result.videoAnalysis = {
          success: true,
          confidence: mrResult.result.confidence,
        };
      } else {
        result.videoAnalysis = {
          success: true,
          confidence: existingAnalysis.confidence,
        };
      }
    } else {
      result.videoAnalysis = {
        success: true,
      };
    }
  } catch (error) {
    result.videoAnalysis = {
      success: false,
      error: error instanceof Error ? error.message : "Video analysis failed",
    };
    console.error("Pipeline analysis: video analysis failed:", error);
  }

  result.processingTimeMs = Date.now() - stageStart;
  return result;
}

export async function runSessionDraftingStage(
  sessionId: string
): Promise<DraftingStageResult> {
  const existingDocs = await prisma.captureDocument.findMany({
    where: { sessionId },
    select: { documentType: true },
  });

  if (existingDocs.length > 0) {
    return {
      success: true,
      documentCount: existingDocs.length,
      documentTypes: existingDocs.map((doc) => doc.documentType),
      estimatedCost: 0,
    };
  }

  let estimatedCost = 0;

  try {
    const updatedSession = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      include: {
        evidence: { orderBy: { capturedAt: "asc" } },
        user: true,
        organization: true,
        analysis: true,
        orgDocument: true,
      },
    });

    if (!updatedSession) throw new Error("Session disappeared during drafting");

    const photoExtractions = updatedSession.evidence
      .filter((e) => e.type === "PHOTO" && e.aiExtraction)
      .map((e) => e.aiExtraction as Record<string, unknown>);

    let videoAnalysis: Record<string, unknown> | null = null;
    if (updatedSession.analysis) {
      videoAnalysis = {
        actionLog: updatedSession.analysis.actionLog as unknown[],
        partsIdentified: updatedSession.analysis.partsIdentified as unknown[],
        procedureSteps: updatedSession.analysis.procedureSteps as unknown[],
        anomalies: updatedSession.analysis.anomalies as unknown[],
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
    let referenceData: string | null = null;
    if (componentInfo) {
      const [cmm, refEntries] = await Promise.all([
        prisma.componentManual.findFirst({
          where: { partNumber: componentInfo.partNumber },
          select: { title: true, partNumber: true },
        }),
        getReferenceDataForPart(componentInfo.partNumber),
      ]);
      if (cmm) {
        cmmReference = `CMM: ${cmm.title} (P/N: ${cmm.partNumber})`;
      }
      if (refEntries.length > 0) {
        referenceData = formatReferenceDataForPrompt(refEntries);
      }
    }

    // If an org document was selected, extract its form fields using vision AI
    let orgDocumentStructure: string | null = null;
    if (updatedSession.orgDocument) {
      try {
        console.log(`[Pipeline] Extracting form fields from org document: ${updatedSession.orgDocument.title}`);
        const extraction = await extractOrgDocumentFields(updatedSession.orgDocument.fileUrl);
        orgDocumentStructure = extraction.rawStructure;
        console.log(`[Pipeline] Extracted ${extraction.fields.length} fields from ${extraction.pageCount} page(s)`);
      } catch (err) {
        console.error("[Pipeline] Org document extraction failed (non-fatal):", err);
      }
    }

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
      userName: `${updatedSession.user.firstName ?? ""} ${updatedSession.user.lastName ?? ""}`.trim(),
      userBadge: updatedSession.user.badgeNumber ?? "",
      componentInfo,
      photoExtractions,
      videoAnalysis,
      audioTranscript,
      cmmReference,
      referenceData,
      targetFormType: updatedSession.targetFormType,
      orgDocumentStructure,
    });

    estimatedCost += 0.065 * (generated.documents?.length || 1);

    const savedTypes: string[] = [];
    for (const doc of generated.documents || []) {
      try {
        await prisma.captureDocument.create({
          data: {
            sessionId,
            documentType: doc.documentType,
            contentJson: doc.contentJson as unknown as Prisma.InputJsonValue,
            status: "draft",
            confidence: clampConfidence(doc.confidence),
            lowConfidenceFields: (doc.lowConfidenceFields || []) as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
      savedTypes.push(doc.documentType);
    }

    return {
      success: true,
      documentCount: savedTypes.length,
      documentTypes: savedTypes,
      estimatedCost,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Document generation failed",
      documentCount: 0,
      documentTypes: [],
      estimatedCost,
    };
  }
}
