// POST /api/mobile/analyze-image — Send a photo to AI vision for OCR / data plate reading
// Uses model fallback chain from lib/ai/openai.ts (GPT-5.4 → GPT-4o → Gemini 3.1 Flash)
// Returns extracted part numbers, serial numbers, and all visible text
// Protected by API key authentication

// Allow up to 30 seconds for image analysis
export const maxDuration = 30;

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { analyzeImageWithFallback } from "@/lib/ai/openai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

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

    const extraction = await analyzeImageWithFallback({
      imageBase64,
      mimeType: bodyMimeType || "image/jpeg",
    });

    // If we have an evidenceId, update the evidence record with the extraction
    // but only if the evidence belongs to a session owned by this technician
    if (evidenceId) {
      const evidence = await prisma.captureEvidence.findUnique({
        where: { id: evidenceId },
        include: { session: { select: { technicianId: true } } },
      });
      if (evidence && evidence.session.technicianId === auth.technician.id) {
        await prisma.captureEvidence.update({
          where: { id: evidenceId },
          data: { aiExtraction: JSON.stringify(extraction) },
        });
      }
    }

    // Try to match a component in our database by part number or serial number
    let componentMatch = null;
    if (extraction.partNumber || extraction.serialNumber) {
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

        // If we have a sessionId, auto-link the component — but only if the
        // session belongs to this technician (prevent cross-session manipulation)
        if (sessionId) {
          await prisma.captureSession.updateMany({
            where: { id: sessionId, technicianId: auth.technician.id },
            data: { componentId: component.id },
          });
        }
      }
    }

    // Log the analysis
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "image_analyzed",
        entityType: "CaptureEvidence",
        entityId: evidenceId || null,
        metadata: JSON.stringify({
          model: extraction.model,
          partNumber: extraction.partNumber,
          serialNumber: extraction.serialNumber,
          confidence: extraction.confidence,
          componentMatched: !!componentMatch,
          fallbackUsed: !!extraction.fallbackUsed,
          fallbackReason: extraction.fallbackReason || null,
        }),
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
    console.error("Analyze image error:", error);
    return NextResponse.json(
      { success: false, error: "Image analysis failed" },
      { status: 500 }
    );
  }
}
