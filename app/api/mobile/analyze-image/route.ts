// POST /api/mobile/analyze-image — Send a photo to AI vision for OCR / data plate reading
// Uses model fallback chain from lib/ai/openai.ts (GPT-5.4 → GPT-4o → Gemini 3.1 Flash)
// Returns extracted part numbers, serial numbers, and all visible text
// Protected by API key authentication

// Allow up to 30 seconds for image analysis
export const maxDuration = 30;

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { authenticateRequest } from "@/lib/mobile-auth";
import { analyzeImageWithFallback } from "@/lib/ai/openai";
import { NextResponse } from "next/server";
import { upsertEvidenceAnalysisState } from "@/lib/session-pipeline-state";

const PRIVILEGED_ROLES = new Set(["SUPERVISOR", "ADMIN"]);

function buildCompletedState(extractedFieldCount: number) {
  return {
    status: "completed" as const,
    updatedAt: new Date().toISOString(),
    processor: "photo_ocr",
    empty: extractedFieldCount === 0,
    metrics: { extractedFieldCount },
  };
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

  let evidenceIdForState: string | null = null;
  let sessionIdForState: string | null = null;

  try {
    const body = await request.json();
    const { evidenceId, imageBase64, sessionId, mimeType: bodyMimeType } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    // Reject images larger than 10MB base64 (~7.5MB actual)
    const MAX_BASE64_SIZE = 10 * 1024 * 1024;
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_BASE64_SIZE) {
      return NextResponse.json(
        { success: false, error: "Image too large. Maximum 10MB base64." },
        { status: 413 }
      );
    }

    let authorizedSessionId: string | null = null;

    if (evidenceId) {
      const evidence = await prisma.captureEvidence.findUnique({
        where: { id: evidenceId },
        include: {
          session: {
            select: {
              id: true,
              userId: true,
              organizationId: true,
            },
          },
        },
      });

      if (!evidence) {
        return NextResponse.json(
          { success: false, error: "Evidence not found" },
          { status: 404 }
        );
      }

      const isSameOrganization =
        evidence.session.organizationId === auth.user.organizationId;
      const isOwner = evidence.session.userId === auth.user.id;
      const isPrivileged = PRIVILEGED_ROLES.has(auth.user.role);

      if (!isSameOrganization || (!isOwner && !isPrivileged)) {
        return NextResponse.json(
          { success: false, error: "Not authorized for this evidence" },
          { status: 403 }
        );
      }

      authorizedSessionId = evidence.session.id;
      evidenceIdForState = evidenceId;
      sessionIdForState = evidence.session.id;
    }

    if (sessionId) {
      const session = await prisma.captureSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          userId: true,
          organizationId: true,
        },
      });

      if (!session) {
        return NextResponse.json(
          { success: false, error: "Session not found" },
          { status: 404 }
        );
      }

      const isSameOrganization =
        session.organizationId === auth.user.organizationId;
      const isOwner = session.userId === auth.user.id;
      const isPrivileged = PRIVILEGED_ROLES.has(auth.user.role);

      if (!isSameOrganization || (!isOwner && !isPrivileged)) {
        return NextResponse.json(
          { success: false, error: "Not authorized for this session" },
          { status: 403 }
        );
      }

      if (authorizedSessionId && session.id !== authorizedSessionId) {
        return NextResponse.json(
          {
            success: false,
            error: "evidenceId and sessionId must reference the same session",
          },
          { status: 400 }
        );
      }

      authorizedSessionId = session.id;
    }

    const extraction = await analyzeImageWithFallback({
      imageBase64,
      mimeType: bodyMimeType || "image/jpeg",
    });

    // If we have an evidenceId, update the evidence record after auth checks.
    if (evidenceId) {
      await prisma.captureEvidence.update({
        where: { id: evidenceId },
        data: { aiExtraction: extraction as unknown as Prisma.InputJsonValue },
      });

      const extractedFieldCount =
        [
          extraction.partNumber,
          extraction.serialNumber,
          extraction.description,
          extraction.manufacturer,
        ].filter((value) => typeof value === "string" && value.trim().length > 0)
          .length +
        extraction.allText.filter((value) => value.trim().length > 0).length;

      if (sessionIdForState) {
        await upsertEvidenceAnalysisState(
          sessionIdForState,
          evidenceId,
          buildCompletedState(extractedFieldCount)
        );
      }
    }

    // Try to match a component in our database by part number or serial number
    let componentMatch = null;
    if (authorizedSessionId && (extraction.partNumber || extraction.serialNumber)) {
      const matchConditions = [];
      if (extraction.serialNumber) {
        matchConditions.push({ serialNumber: extraction.serialNumber });
      }
      if (extraction.partNumber) {
        matchConditions.push({ partNumber: extraction.partNumber });
      }

      const component = await prisma.component.findFirst({
        where: { OR: matchConditions },
        select: {
          id: true,
          partNumber: true,
          serialNumber: true,
          description: true,
        },
      });

      if (component) {
        componentMatch = component;

        await prisma.captureSession.update({
          where: { id: authorizedSessionId },
          data: { componentId: component.id },
        });
      }
    }

    // Log the analysis
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        action: "image_analyzed",
        entityType: "CaptureEvidence",
        entityId: evidenceId || null,
        metadata: {
          model: extraction.model,
          partNumber: extraction.partNumber,
          serialNumber: extraction.serialNumber,
          confidence: extraction.confidence,
          componentMatched: !!componentMatch,
          fallbackUsed: !!extraction.fallbackUsed,
          fallbackReason: extraction.fallbackReason || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        extraction,
        componentMatch,
      },
    });
  } catch (error) {
    if (evidenceIdForState && sessionIdForState) {
      await upsertEvidenceAnalysisState(
        sessionIdForState,
        evidenceIdForState,
        {
          status: "failed",
          updatedAt: new Date().toISOString(),
          processor: "photo_ocr",
          error: error instanceof Error ? error.message : "Image analysis failed",
        }
      );
    }

    console.error("Analyze image error:", error);
    return NextResponse.json(
      { success: false, error: "Image analysis failed" },
      { status: 500 }
    );
  }
}
