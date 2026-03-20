// POST /api/sessions/[id]/create-document — Create a document manually from the web dashboard
// Accepts a document type and optional description, generates the document via AI
// Protected by dashboard session auth (passcode cookie)

export const maxDuration = 60;

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/rbac";
import { clampConfidence } from "@/lib/ai/utils";
import { generateDocuments } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

const SUPPORTED_DOCUMENT_TYPES: Record<string, string> = {
  "8130-3": "FAA 8130-3 — Airworthiness Approval Tag",
  "337": "FAA Form 337 — Major Repair and Alteration",
  "8010-4": "FAA 8010-4 — Malfunction/Defect Report",
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

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
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check for duplicate
    const existing = await prisma.captureDocument.findFirst({
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
      .map((e) => e.aiExtraction as Record<string, unknown>);

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
      userName: `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim(),
      userBadge: session.user.badgeNumber ?? "",
      componentInfo,
      photoExtractions,
      videoAnalysis,
      videoAnnotations,
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
    const evidenceLineage = doc?.evidenceLineage || null;

    let saved;
    try {
      saved = await prisma.captureDocument.create({
        data: {
          sessionId,
          documentType,
          contentJson: contentJson as unknown as Prisma.InputJsonValue,
          status: "draft",
          confidence,
          lowConfidenceFields: lowConfidenceFields as unknown as Prisma.InputJsonValue,
          evidenceLineage: evidenceLineage ? (evidenceLineage as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          {
            error: `A ${SUPPORTED_DOCUMENT_TYPES[documentType]} already exists for this session.`,
          },
          { status: 409 }
        );
      }
      throw error;
    }

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
        userId: session.userId,
        action: "document_manually_created",
        entityType: "CaptureSession",
        entityId: sessionId,
        metadata: { documentType, description: description || null },
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
