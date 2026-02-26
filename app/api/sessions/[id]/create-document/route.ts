// POST /api/sessions/[id]/create-document — Create a document manually from the web dashboard
// Accepts a document type and optional description, generates the document via AI
// Protected by dashboard session auth (passcode cookie)

export const maxDuration = 60;

import { prisma } from "@/lib/db";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { clampConfidence } from "@/lib/ai/utils";
import { generateDocuments } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

const SUPPORTED_DOCUMENT_TYPES: Record<string, string> = {
  "8130-3": "FAA 8130-3 — Airworthiness Approval Tag",
  "337": "FAA Form 337 — Major Repair and Alteration",
  "8010-4": "FAA 8010-4 — Malfunction/Defect Report",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id: sessionId } = await params;

  let documentType: string;
  let description: string | undefined;

  try {
    const body = await request.json();
    documentType = body.documentType;
    description = body.description;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!documentType || !SUPPORTED_DOCUMENT_TYPES[documentType]) {
    return NextResponse.json(
      { error: `Invalid documentType. Supported: ${Object.keys(SUPPORTED_DOCUMENT_TYPES).join(", ")}` },
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
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check for duplicate
    const existing = await prisma.documentGeneration2.findFirst({
      where: { sessionId, documentType },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A ${SUPPORTED_DOCUMENT_TYPES[documentType]} already exists for this session.` },
        { status: 409 }
      );
    }

    // Gather evidence
    const photoExtractions = session.evidence
      .filter((e) => e.type === "PHOTO" && e.aiExtraction)
      .map((e) => { try { return JSON.parse(e.aiExtraction!); } catch { return { raw: e.aiExtraction }; } });

    let videoAnalysis: Record<string, unknown> | null = null;
    if (session.analysis) {
      const safeParse = (s: string, fallback: unknown = []) => { try { return JSON.parse(s); } catch { return fallback; } };
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

    // Generate the document
    const typeLabel = SUPPORTED_DOCUMENT_TYPES[documentType];

    const result = await generateDocuments({
      organizationName: session.organization.name,
      organizationCert: session.organization.faaRepairStationCert,
      organizationAddress: [session.organization.address, session.organization.city, session.organization.state, session.organization.zip].filter(Boolean).join(", "),
      technicianName: `${session.technician.firstName} ${session.technician.lastName}`,
      technicianBadge: session.technician.badgeNumber,
      componentInfo,
      photoExtractions,
      videoAnalysis,
      audioTranscript,
      cmmReference,
      referenceData: [
        `INSTRUCTION: You MUST generate exactly one document of type "${documentType}" (${typeLabel}).`,
        description ? `USER DESCRIPTION: "${description}". Use this context to fill in form fields.` : "",
        "Generate this document even if evidence is sparse — use reasonable defaults and mark uncertain fields in lowConfidenceFields.",
      ].filter(Boolean).join("\n"),
    });

    const doc = result.documents.find((d) => d.documentType === documentType)
      || result.documents[0];

    const contentJson = doc?.contentJson || { note: "Generated with limited evidence. Please review and complete all fields." };
    const confidence = doc ? clampConfidence(doc.confidence) : 0.3;
    const lowConfidenceFields = doc?.lowConfidenceFields || ["all fields"];

    const saved = await prisma.documentGeneration2.create({
      data: {
        sessionId,
        documentType,
        contentJson: JSON.stringify(contentJson),
        status: "draft",
        confidence,
        lowConfidenceFields: JSON.stringify(lowConfidenceFields),
      },
    });

    // Update session status
    if (session.status === "capture_complete" || session.status === "capturing") {
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: { status: "documents_generated" },
      });
    }

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: session.organization.id,
        technicianId: session.technicianId,
        action: "document_manually_created",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: JSON.stringify({ documentType, description: description || null }),
      },
    });

    return NextResponse.json({
      id: saved.id,
      documentType: saved.documentType,
      status: saved.status,
      confidence,
    });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document creation failed" },
      { status: 500 }
    );
  }
}
