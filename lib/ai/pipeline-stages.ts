import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { isAllowedEvidenceUrl } from "@/lib/evidence-url";
import {
  uploadFileToGemini,
  waitForFileProcessing,
  analyzeSessionVideo,
  deleteGeminiFile,
} from "./gemini";
import { generateDocuments } from "./openai";
import { clampConfidence } from "./utils";

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
      technician: true,
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
        const video = videoEvidence[0];
        if (!isAllowedEvidenceUrl(video.fileUrl)) {
          throw new Error("Video evidence URL host is not allowed");
        }

        const videoResponse = await fetch(video.fileUrl);
        if (!videoResponse.ok) {
          throw new Error(
            `Could not download video file (status ${videoResponse.status})`
          );
        }
        const fileBuffer = Buffer.from(await videoResponse.arrayBuffer());

        const uploadedFile = await uploadFileToGemini(
          fileBuffer,
          video.mimeType,
          `pipeline-${sessionId}`
        );
        const processedFile = await waitForFileProcessing(uploadedFile.name);

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
                const cmmResponse = await fetch(cmm.fileUrl);
                if (cmmResponse.ok) {
                  cmmContent = await cmmResponse.text();
                }
              } catch {
                console.warn("Pipeline analysis: could not load CMM file");
              }
            }
          }
        }

        const analysis = await analyzeSessionVideo(
          processedFile.uri,
          video.mimeType,
          cmmContent
        );

        await prisma.sessionAnalysis.create({
          data: {
            sessionId,
            actionLog: JSON.stringify(analysis.actionLog),
            partsIdentified: JSON.stringify(analysis.partsIdentified),
            procedureSteps: JSON.stringify(analysis.procedureSteps),
            anomalies: JSON.stringify(analysis.anomalies),
            confidence: clampConfidence(analysis.confidence),
            modelUsed: analysis.modelUsed,
            costEstimate: null,
            processingTime: Date.now() - stageStart,
          },
        });

        deleteGeminiFile(uploadedFile.name).catch(() => {});

        result.videoAnalysis = {
          success: true,
          confidence: analysis.confidence,
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
  const existingDocs = await prisma.documentGeneration2.findMany({
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
        technician: true,
        organization: true,
        analysis: true,
      },
    });

    if (!updatedSession) throw new Error("Session disappeared during drafting");

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
      referenceData: null,
    });

    estimatedCost += 0.065 * (generated.documents?.length || 1);

    const savedTypes: string[] = [];
    for (const doc of generated.documents || []) {
      try {
        await prisma.documentGeneration2.create({
          data: {
            sessionId,
            documentType: doc.documentType,
            contentJson: JSON.stringify(doc.contentJson),
            status: "draft",
            confidence: clampConfidence(doc.confidence),
            lowConfidenceFields: JSON.stringify(doc.lowConfidenceFields || []),
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
