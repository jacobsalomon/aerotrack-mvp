// POST /api/mobile/create-document — Manually create a compliance document for a session
// Allows the user to select a document type and optionally describe what they need.
// The AI generates the document using session evidence + the user's description.
// Protected by API key authentication.

export const maxDuration = 60;

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { clampConfidence } from "@/lib/ai/utils";
import { generateDocuments } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

const SUPPORTED_DOCUMENT_TYPES: Record<string, { label: string; description: string }> = {
  "8130-3": {
    label: "FAA 8130-3 — Airworthiness Approval Tag",
    description: "Authorized Release Certificate used when returning a part to service after maintenance, repair, or overhaul.",
  },
  "337": {
    label: "FAA Form 337 — Major Repair and Alteration",
    description: "Required when major repairs or alterations have been performed on an aircraft, engine, or propeller.",
  },
  "8010-4": {
    label: "FAA 8010-4 — Malfunction/Defect Report",
    description: "Used to report malfunctions, defects, or unairworthy conditions found during maintenance.",
  },
};

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  let sessionId: string;
  let documentType: string;
  let userDescription: string | undefined;

  try {
    const body = await request.json();
    sessionId = body.sessionId;
    documentType = body.documentType;
    userDescription = body.description;
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

  if (!documentType || !SUPPORTED_DOCUMENT_TYPES[documentType]) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid documentType. Supported types: ${Object.keys(SUPPORTED_DOCUMENT_TYPES).join(", ")}`,
        availableDocumentTypes: Object.entries(SUPPORTED_DOCUMENT_TYPES).map(
          ([type, info]) => ({ type, ...info })
        ),
      },
      { status: 400 }
    );
  }

  try {
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

    // Check if this document type already exists for this session
    const existingDoc = await prisma.documentGeneration2.findFirst({
      where: { sessionId, documentType },
    });
    if (existingDoc) {
      return NextResponse.json(
        { success: false, error: `A ${SUPPORTED_DOCUMENT_TYPES[documentType].label} already exists for this session.` },
        { status: 409 }
      );
    }

    // Gather evidence (same as auto-generate)
    const photoExtractions = session.evidence
      .filter((e) => e.type === "PHOTO" && e.aiExtraction)
      .map((e) => {
        try { return JSON.parse(e.aiExtraction!); } catch { return { raw: e.aiExtraction }; }
      });

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

    const audioChunks = session.evidence
      .filter((e) => e.type === "AUDIO_CHUNK" && e.transcription)
      .map((e) => e.transcription!);
    const audioTranscript = audioChunks.length > 0 ? audioChunks.join("\n") : null;

    let componentInfo: {
      partNumber: string; serialNumber: string; description: string;
      oem: string; totalHours: number; totalCycles: number;
    } | null = null;

    if (session.componentId) {
      const component = await prisma.component.findUnique({
        where: { id: session.componentId },
        select: { partNumber: true, serialNumber: true, description: true, oem: true, totalHours: true, totalCycles: true },
      });
      if (component) componentInfo = component;
    }

    let cmmReference: string | null = null;
    if (componentInfo) {
      const cmm = await prisma.componentManual.findFirst({
        where: { partNumber: componentInfo.partNumber },
        select: { title: true, partNumber: true },
      });
      if (cmm) cmmReference = `CMM: ${cmm.title} (P/N: ${cmm.partNumber})`;
    }

    // Generate the specific document type using AI
    const startTime = Date.now();

    // Build enhanced prompt with user's description and forced document type
    const result = await generateDocumentByType({
      documentType,
      userDescription: userDescription || undefined,
      organizationName: session.organization.name,
      organizationCert: session.organization.faaRepairStationCert,
      organizationAddress: [
        session.organization.address, session.organization.city,
        session.organization.state, session.organization.zip,
      ].filter(Boolean).join(", "),
      technicianName: `${session.technician.firstName} ${session.technician.lastName}`,
      technicianBadge: session.technician.badgeNumber,
      componentInfo,
      photoExtractions,
      videoAnalysis,
      audioTranscript,
      cmmReference,
    });

    const latencyMs = Date.now() - startTime;

    // Save the document
    const saved = await prisma.documentGeneration2.create({
      data: {
        sessionId,
        documentType: result.documentType,
        contentJson: JSON.stringify(result.contentJson),
        status: "draft",
        confidence: clampConfidence(result.confidence),
        lowConfidenceFields: JSON.stringify(result.lowConfidenceFields || []),
      },
    });

    // Update session status to documents_generated if not already
    if (session.status === "capture_complete" || session.status === "capturing") {
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { status: "documents_generated" },
      });
    }

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "document_manually_created",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: JSON.stringify({
          documentType,
          userDescription: userDescription || null,
          latencyMs,
          confidence: result.confidence,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        document: {
          ...saved,
          contentJson: result.contentJson,
          lowConfidenceFields: result.lowConfidenceFields || [],
        },
        summary: result.reasoning,
      },
    });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Document creation failed",
      },
      { status: 500 }
    );
  }
}

// GET /api/mobile/create-document — Return available document types
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      availableDocumentTypes: Object.entries(SUPPORTED_DOCUMENT_TYPES).map(
        ([type, info]) => ({ type, ...info })
      ),
    },
  });
}

// Generate a single document of a specific type using the AI
async function generateDocumentByType(opts: {
  documentType: string;
  userDescription?: string;
  organizationName: string;
  organizationCert: string | null;
  organizationAddress: string;
  technicianName: string;
  technicianBadge: string;
  componentInfo: { partNumber: string; serialNumber: string; description: string; oem: string; totalHours: number; totalCycles: number } | null;
  photoExtractions: Array<Record<string, unknown>>;
  videoAnalysis: Record<string, unknown> | null;
  audioTranscript: string | null;
  cmmReference: string | null;
}) {
  // Use the existing generateDocuments function but with a forced document type hint
  const typeInfo = SUPPORTED_DOCUMENT_TYPES[opts.documentType];

  const result = await generateDocuments({
    organizationName: opts.organizationName,
    organizationCert: opts.organizationCert,
    organizationAddress: opts.organizationAddress,
    technicianName: opts.technicianName,
    technicianBadge: opts.technicianBadge,
    componentInfo: opts.componentInfo,
    photoExtractions: opts.photoExtractions,
    videoAnalysis: opts.videoAnalysis,
    audioTranscript: opts.audioTranscript,
    cmmReference: opts.cmmReference,
    referenceData: [
      `INSTRUCTION: You MUST generate exactly one document of type "${opts.documentType}" (${typeInfo.label}).`,
      opts.userDescription ? `USER DESCRIPTION: The technician has specifically requested this document with the following context: "${opts.userDescription}". Use this to fill in form fields appropriately.` : "",
      "Generate this document even if evidence is sparse — use reasonable defaults and mark uncertain fields in lowConfidenceFields.",
    ].filter(Boolean).join("\n"),
  });

  // Extract the requested document type from results, or use the first result
  const doc = result.documents.find((d) => d.documentType === opts.documentType)
    || result.documents[0];

  if (!doc) {
    // If AI returned nothing, create a minimal stub
    return {
      documentType: opts.documentType,
      contentJson: { note: "Document generated with limited evidence. Please review and complete all fields." },
      confidence: 0.3,
      lowConfidenceFields: ["all fields"],
      reasoning: "Generated with limited evidence — manual review required.",
    };
  }

  return doc;
}
