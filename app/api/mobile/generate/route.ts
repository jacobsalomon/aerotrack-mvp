// POST /api/mobile/generate — Generate FAA compliance documents from full evidence pipeline
// Collects all evidence: photo OCR + video analysis + audio transcript + CMM reference
// Sends to GPT-4o with structured JSON output for FAA form field generation
// Determines which documents are needed (8130-3, 337, 8010-4) and generates them
// Protected by API key authentication

// Allow up to 60 seconds for GPT-4o document generation + verification
export const maxDuration = 60;

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { clampConfidence } from "@/lib/ai/utils";
import { generateDocuments } from "@/lib/ai/openai";
import {
  getReferenceDataForPart,
  formatReferenceDataForPrompt,
} from "@/lib/reference-data";
import { verifyDocuments } from "@/lib/ai/verify";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

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

    // Load the session with all evidence, analysis, technician, and org info
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      include: {
        evidence: { orderBy: { capturedAt: "asc" } },
        technician: true,
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

    if (session.technicianId !== auth.technician.id) {
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
    const existingDocs = await prisma.documentGeneration2.findMany({
      where: { sessionId },
    });
    if (existingDocs.length > 0) {
      return NextResponse.json({
        success: true,
        cached: true,
        data: {
          documents: existingDocs.map((doc) => {
            let contentJson, lowConfidenceFields;
            try { contentJson = JSON.parse(doc.contentJson); } catch { contentJson = {}; }
            try { lowConfidenceFields = JSON.parse(doc.lowConfidenceFields || "[]"); } catch { lowConfidenceFields = []; }
            return { ...doc, contentJson, lowConfidenceFields };
          }),
          summary: "Documents already generated for this session",
          sessionStatus: session.status,
        },
      });
    }

    // === Gather all evidence from the pipeline ===

    // 1. Photo OCR extractions
    const photoExtractions = session.evidence
      .filter((e) => e.type === "PHOTO" && e.aiExtraction)
      .map((e) => {
        try {
          return JSON.parse(e.aiExtraction!);
        } catch {
          return { raw: e.aiExtraction };
        }
      });

    // 2. Video analysis (from deep analysis Pass 2, if available)
    let videoAnalysis: Record<string, unknown> | null = null;
    if (session.analysis) {
      const safeParse = (s: string, fallback: unknown = []) => {
        try { return JSON.parse(s); } catch { return fallback; }
      };
      videoAnalysis = {
        actionLog: safeParse(session.analysis.actionLog),
        partsIdentified: safeParse(session.analysis.partsIdentified),
        procedureSteps: safeParse(session.analysis.procedureSteps),
        anomalies: safeParse(session.analysis.anomalies),
        confidence: session.analysis.confidence,
      };
    }

    // 3. Audio transcript (stitched from all audio chunks)
    const audioChunks = session.evidence
      .filter((e) => e.type === "AUDIO_CHUNK" && e.transcription)
      .map((e) => e.transcription!);
    const audioTranscript =
      audioChunks.length > 0 ? audioChunks.join("\n") : null;

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
      technicianName: `${session.technician.firstName} ${session.technician.lastName}`,
      technicianBadge: session.technician.badgeNumber,
      componentInfo,
      photoExtractions,
      videoAnalysis,
      audioTranscript,
      cmmReference,
      referenceData: referenceDataText,
    });

    const latencyMs = Date.now() - startTime;

    // === Save generated documents to database ===
    const savedDocuments = [];
    for (const doc of result.documents || []) {
      const saved = await prisma.documentGeneration2.create({
        data: {
          sessionId,
          documentType: doc.documentType,
          contentJson: JSON.stringify(doc.contentJson),
          status: "draft",
          confidence: clampConfidence(doc.confidence),
          lowConfidenceFields: JSON.stringify(doc.lowConfidenceFields || []),
        },
      });
      savedDocuments.push({
        ...saved,
        contentJson: doc.contentJson,
        lowConfidenceFields: doc.lowConfidenceFields || [],
      });
    }

    // Update session status — only mark "documents_generated" if we actually produced documents.
    // If AI couldn't determine what docs to generate, reset to "capture_complete" so user can retry.
    const finalStatus =
      savedDocuments.length > 0 ? "documents_generated" : "capture_complete";
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: finalStatus },
    });

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "documents_generated",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: JSON.stringify({
          model: process.env.GENERATION_MODEL || "openai/gpt-4o",
          documentCount: savedDocuments.length,
          documentTypes: savedDocuments.map((d) => d.documentType),
          latencyMs,
          hasReferenceData: !!referenceDataText,
          evidenceSources: {
            photoExtractions: photoExtractions.length,
            hasVideoAnalysis: !!videoAnalysis,
            hasAudioTranscript: !!audioTranscript,
            hasCmmReference: !!cmmReference,
          },
        }),
      },
    });

    // === Auto-trigger verification (best-effort — don't fail generation if this breaks) ===
    // Direct function call instead of HTTP self-call (more reliable on serverless)
    let verification = null;
    try {
      const verifyResult = await verifyDocuments(sessionId, auth.technician.id);
      verification = verifyResult.verification;
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
        sessionStatus: finalStatus,
        verification,
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
