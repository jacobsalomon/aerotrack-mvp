// POST /api/mobile/generate — Generate FAA compliance documents from full evidence pipeline
// Collects all evidence: photo OCR + video analysis + audio transcript + CMM reference
// Sends to GPT-4o with structured JSON output for FAA form field generation
// Determines which documents are needed (8130-3, 337, 8010-4) and generates them
// Protected by API key authentication

// Allow up to 120 seconds for multi-model generation + verification
export const maxDuration = 120;

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { authenticateRequest } from "@/lib/mobile-auth";
import { clampConfidence } from "@/lib/ai/utils";
import { generateDocuments } from "@/lib/ai/openai";
import {
  getReferenceDataForPart,
  formatReferenceDataForPrompt,
} from "@/lib/reference-data";
import { verifyDocuments } from "@/lib/ai/verify";
import { NextResponse } from "next/server";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

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

  // Parse request body with its own error handling so malformed JSON
  // returns 400 instead of crashing and leaving the session stuck
  let sessionId: string;
  try {
    const body = await request.json();
    sessionId = body.sessionId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId is required" },
      { status: 400 }
    );
  }

  try {

    // Load the session with all evidence, analysis, user, and org info
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      include: {
        evidence: {
          include: { videoAnnotations: { orderBy: { timestamp: "asc" } } },
          orderBy: { capturedAt: "asc" },
        },
        user: true,
        organization: true,
        analysis: true,
      },
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

    if (session.evidence.length === 0) {
      return NextResponse.json(
        { success: false, error: "No evidence captured in this session" },
        { status: 400 }
      );
    }

    // Check for existing documents to prevent duplicates on retry
    const existingDocs = await prisma.captureDocument.findMany({
      where: { sessionId },
    });
    if (existingDocs.length > 0) {
      return NextResponse.json({
        success: true,
        cached: true,
        data: {
          documents: existingDocs.map((doc) => ({
            ...doc,
            contentJson: doc.contentJson ?? {},
            lowConfidenceFields: doc.lowConfidenceFields ?? [],
            provenanceJson: doc.provenanceJson ?? {},
          })),
          summary: "Documents already generated for this session",
          discrepancies: [],
          sessionStatus: session.status,
        },
      });
    }

    // === Gather all evidence from the pipeline ===

    // 1. Photo OCR extractions
    const photoExtractions = session.evidence
      .filter((e) => e.type === "PHOTO" && e.aiExtraction)
      .map((e) => e.aiExtraction as Record<string, unknown>);

    // 2. Video analysis (from deep analysis Pass 2, if available)
    let videoAnalysis: Record<string, unknown> | null = null;
    if (session.analysis) {
      videoAnalysis = {
        actionLog: session.analysis.actionLog as unknown[],
        partsIdentified: session.analysis.partsIdentified as unknown[],
        procedureSteps: session.analysis.procedureSteps as unknown[],
        anomalies: session.analysis.anomalies as unknown[],
        confidence: session.analysis.confidence,
      };
    }

    // 2b. Video annotations (timestamped tags from video annotation pass)
    const videoAnnotations = session.evidence
      .filter((e) => e.type === "VIDEO")
      .flatMap((e) =>
        (e.videoAnnotations || []).map((a) => ({
          timestamp: a.timestamp,
          tag: a.tag,
          description: a.description,
          confidence: a.confidence,
        }))
      );

    // 3. Audio transcript (stitched from all audio chunks)
    const audioChunks = session.evidence
      .filter((e) => e.type === "AUDIO_CHUNK" && e.transcription)
      .map((e) => e.transcription!);
    const audioTranscript =
      session.analysis?.audioTranscript ||
      (audioChunks.length > 0 ? audioChunks.join("\n") : null);

    // 4. Component info (if identified)
    let componentInfo: {
      partNumber: string;
      serialNumber: string;
      description: string;
      oem: string;
      totalHours: number;
      totalCycles: number;
    } | null = null;

    if (session.componentId) {
      const component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: {
          partNumber: true,
          serialNumber: true,
          description: true,
          oem: true,
          totalHours: true,
          totalCycles: true,
        },
      });
      if (component) {
        componentInfo = component;
      }
    }

    // 5. CMM reference (if available for this part)
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

    // 6. Reference data (procedures, limits, specs for this part number)
    let referenceDataText: string | null = null;
    if (componentInfo) {
      const refEntries = await getReferenceDataForPart(componentInfo.partNumber);
      if (refEntries.length > 0) {
        referenceDataText = formatReferenceDataForPrompt(refEntries);
      }
    }

    // === Call GPT-4o to generate documents ===
    const startTime = Date.now();

    const result = await generateDocuments({
      organizationName: session.organization.name,
      organizationCert: session.organization.faaRepairStationCert,
      organizationAddress: [
        session.organization.address,
        session.organization.city,
        session.organization.state,
        session.organization.zip,
      ]
        .filter(Boolean)
        .join(", "),
      userName: `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim(),
      userBadge: session.user.badgeNumber ?? "",
      componentInfo,
      photoExtractions,
      videoAnalysis,
      videoAnnotations,
      audioTranscript,
      cmmReference,
      referenceData: referenceDataText,
    });

    const latencyMs = Date.now() - startTime;

    // === Save generated documents to database ===
    const savedDocuments = [];
    for (const doc of result.documents || []) {
      const docProvenance = doc.provenance || doc.evidenceLineage || {};
      const docDiscrepancies = doc.discrepancies || [];
      let saved;
      try {
        saved = await prisma.captureDocument.create({
          data: {
            sessionId,
            documentType: doc.documentType,
            contentJson: JSON.parse(JSON.stringify(doc.contentJson)),
            status: "draft",
            confidence: clampConfidence(doc.confidence),
            lowConfidenceFields: JSON.parse(JSON.stringify(doc.lowConfidenceFields || [])),
            evidenceLineage: doc.evidenceLineage ? JSON.parse(JSON.stringify(doc.evidenceLineage)) : null,
            provenanceJson: docProvenance ? JSON.parse(JSON.stringify(docProvenance)) : null,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;

        const existing = await prisma.captureDocument.findFirst({
          where: {
            sessionId,
            documentType: doc.documentType,
          },
        });

        if (!existing) throw error;
        saved = existing;
      }

      const parsedContentJson = saved.contentJson ?? doc.contentJson;
      const parsedLowConfidenceFields = saved.lowConfidenceFields ?? doc.lowConfidenceFields ?? [];
      const parsedEvidenceLineage = saved.evidenceLineage ?? null;
      const parsedProvenanceJson = saved.provenanceJson ?? docProvenance;

      savedDocuments.push({
        ...saved,
        contentJson: parsedContentJson,
        lowConfidenceFields: parsedLowConfidenceFields,
        evidenceLineage: parsedEvidenceLineage,
        provenanceJson: parsedProvenanceJson,
        discrepancies: docDiscrepancies,
      });
    }

    const discrepancies = result.discrepancies || [];

    // Mark this stage complete even if document count is low.
    const finalStatus = "documents_generated";
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: finalStatus },
    });

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "documents_generated",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: {
          model: result.modelUsed,
          documentCount: savedDocuments.length,
          documentTypes: savedDocuments.map((d) => d.documentType),
          discrepancyCount: discrepancies.length,
          latencyMs,
          fallbackUsed: !!result.fallbackUsed,
          fallbackReason: result.fallbackReason || null,
          hasReferenceData: !!referenceDataText,
          evidenceSources: {
            photoExtractions: photoExtractions.length,
            hasVideoAnalysis: !!videoAnalysis,
            hasAudioTranscript: !!audioTranscript,
            hasCmmReference: !!cmmReference,
          },
        },
      },
    });

    // === Auto-trigger verification (best-effort — don't fail generation if this breaks) ===
    // Direct function call instead of HTTP self-call (more reliable on serverless)
    let verification = null;
    let verifiedSessionStatus: string | null = null;
    try {
      const verifyResult = await verifyDocuments(sessionId, auth.user.id);
      verification = verifyResult.verification;
      verifiedSessionStatus = verifyResult.sessionStatus;
    } catch (verifyError) {
      // Verification is best-effort — log but don't fail
      console.warn(
        "Auto-verification failed (non-blocking):",
        verifyError instanceof Error ? verifyError.message : verifyError
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: savedDocuments,
        summary:
          savedDocuments.length > 0
            ? result.summary || "Documents generated"
            : "No compliance documents could be determined from the captured evidence. You can create a document manually or retry after adding more evidence.",
        sessionStatus: verifiedSessionStatus || finalStatus,
        verification,
        discrepancies,
        evidenceSources: {
          photoExtractions: photoExtractions.length,
          hasVideoAnalysis: !!videoAnalysis,
          hasAudioTranscript: !!audioTranscript,
          hasCmmReference: !!cmmReference,
          hasReferenceData: !!referenceDataText,
        },
        // When no documents are auto-generated, provide available types so the client
        // can offer manual creation
        ...(savedDocuments.length === 0 && {
          availableDocumentTypes: [
            {
              type: "8130-3",
              label: "FAA 8130-3 — Airworthiness Approval Tag",
              description: "Authorized Release Certificate for returning a part to service.",
            },
            {
              type: "337",
              label: "FAA Form 337 — Major Repair and Alteration",
              description: "Required for major repairs or alterations performed.",
            },
            {
              type: "8010-4",
              label: "FAA 8010-4 — Malfunction/Defect Report",
              description: "Report malfunctions or defects found during maintenance.",
            },
          ],
          createDocumentEndpoint: "/api/mobile/create-document",
        }),
      },
    });
  } catch (error) {
    console.error("Generate documents error:", error);
    // Reset session status so it doesn't get stuck in "processing" forever
    try {
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { status: "capture_complete" },
      });
    } catch {
      // Best effort — don't mask the original error
    }
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Document generation failed",
      },
      { status: 500 }
    );
  }
}
