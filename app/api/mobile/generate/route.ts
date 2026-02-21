// POST /api/mobile/generate — Generate FAA compliance documents from full evidence pipeline
// Collects all evidence: photo OCR + video analysis + audio transcript + CMM reference
// Sends to GPT-4o with structured JSON output for FAA form field generation
// Determines which documents are needed (8130-3, 337, 8010-4) and generates them
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { generateDocuments } from "@/lib/ai/openai";
import {
  getReferenceDataForPart,
  formatReferenceDataForPrompt,
} from "@/lib/reference-data";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId is required" },
        { status: 400 }
      );
    }

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
      videoAnalysis = {
        actionLog: JSON.parse(session.analysis.actionLog),
        partsIdentified: JSON.parse(session.analysis.partsIdentified),
        procedureSteps: JSON.parse(session.analysis.procedureSteps),
        anomalies: JSON.parse(session.analysis.anomalies),
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
          confidence: doc.confidence || 0,
          lowConfidenceFields: JSON.stringify(doc.lowConfidenceFields || []),
        },
      });
      savedDocuments.push({
        ...saved,
        contentJson: doc.contentJson,
        lowConfidenceFields: doc.lowConfidenceFields || [],
      });
    }

    // Update session status
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: "documents_generated" },
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
    let verification = null;
    try {
      const verifyUrl = new URL("/api/mobile/verify-documents", request.url);
      const verifyResponse = await fetch(verifyUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: request.headers.get("Authorization") || "",
        },
        body: JSON.stringify({ sessionId }),
      });
      if (verifyResponse.ok) {
        const verifyResult = await verifyResponse.json();
        if (verifyResult.success) {
          verification = verifyResult.data?.verification || null;
        }
      }
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
        summary: result.summary || "Documents generated",
        sessionStatus: "documents_generated",
        verification,
        evidenceSources: {
          photoExtractions: photoExtractions.length,
          hasVideoAnalysis: !!videoAnalysis,
          hasAudioTranscript: !!audioTranscript,
          hasCmmReference: !!cmmReference,
          hasReferenceData: !!referenceDataText,
        },
      },
    });
  } catch (error) {
    console.error("Generate documents error:", error);
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
