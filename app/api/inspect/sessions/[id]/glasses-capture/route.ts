// POST /api/inspect/sessions/[id]/glasses-capture
// Receives measurements and photos from the AeroVision Glass iOS app.
// For measurements: runs auto-matching against pending checklist items.
// For photos: stores as CaptureEvidence linked to the session.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff } from "@/lib/inspect/inspection-helpers";
import {
  matchMeasurementToItem,
  type CandidateItem,
} from "@/lib/inspect/match-measurement-to-item";

type RouteContext = { params: Promise<{ id: string }> };

// Confidence thresholds for auto-matching
const HIGH_CONFIDENCE = 0.7;

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id: sessionId } = await params;

    // Validate session exists and belongs to the user's org
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        organizationId: true,
        componentId: true,
        sessionType: true,
        signedOffAt: true,
        activeInspectionSectionId: true,
        inspectionTemplate: {
          select: {
            sections: {
              select: {
                id: true,
                items: {
                  select: {
                    id: true,
                    parameterName: true,
                    specUnit: true,
                    specValueLow: true,
                    specValueHigh: true,
                    itemCallout: true,
                    itemType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.sessionType !== "inspection") {
      return NextResponse.json({ success: false, error: "Not an inspection session" }, { status: 400 });
    }

    // Prevent modifications to signed-off sessions (compliance requirement)
    if (session.signedOffAt) {
      return NextResponse.json({ success: false, error: "Session is signed off" }, { status: 403 });
    }

    const body = await request.json();

    if (body.type === "measurement") {
      return handleMeasurement(body, session, sessionId, authResult.user.id);
    } else if (body.type === "photo") {
      return handlePhoto(body, session, sessionId);
    } else {
      return NextResponse.json({ success: false, error: "Invalid type. Expected 'measurement' or 'photo'" }, { status: 400 });
    }
  } catch (error) {
    console.error("[glasses-capture POST]", error);
    return NextResponse.json({ success: false, error: "Failed to process capture" }, { status: 500 });
  }
}

// Handle a measurement from the glasses
async function handleMeasurement(
  body: { value: number; unit: string; confidence?: number; timestamp?: string; assignToItemId?: string },
  session: {
    id: string;
    organizationId: string;
    componentId: string | null;
    activeInspectionSectionId: string | null;
    inspectionTemplate: {
      sections: Array<{
        id: string;
        items: Array<{
          id: string;
          parameterName: string;
          specUnit: string | null;
          specValueLow: number | null;
          specValueHigh: number | null;
          itemCallout: string | null;
          itemType: string;
        }>;
      }>;
    } | null;
  },
  sessionId: string,
  userId: string
) {
  const { value, unit, confidence: glassesConfidence, assignToItemId } = body;

  if (typeof value !== "number" || !unit) {
    return NextResponse.json({ success: false, error: "Missing value or unit" }, { status: 400 });
  }

  // Build candidate items from the template
  const candidates: CandidateItem[] = [];
  for (const section of session.inspectionTemplate?.sections || []) {
    for (const item of section.items) {
      candidates.push({
        id: item.id,
        sectionId: section.id,
        parameterName: item.parameterName,
        specUnit: item.specUnit,
        specValueLow: item.specValueLow,
        specValueHigh: item.specValueHigh,
        itemCallout: item.itemCallout,
      });
    }
  }

  // If the client already picked an item (e.g., from toast Accept), use it directly
  // Otherwise, run the matching algorithm
  let assignedItemId: string | null = null;
  let match: ReturnType<typeof matchMeasurementToItem> = null;

  if (assignToItemId && candidates.some((c) => c.id === assignToItemId)) {
    // Client specified the item — trust it (validated against template)
    assignedItemId = assignToItemId;
    match = {
      itemId: assignToItemId,
      sectionId: candidates.find((c) => c.id === assignToItemId)!.sectionId,
      parameterName: candidates.find((c) => c.id === assignToItemId)!.parameterName,
      itemCallout: candidates.find((c) => c.id === assignToItemId)!.itemCallout,
      confidence: 1,
    };
  } else {
    // Get completed item IDs so we can deprioritize them
    const completedProgress = await prisma.inspectionProgress.findMany({
      where: { captureSessionId: sessionId, status: { in: ["done", "skipped"] } },
      select: { inspectionItemId: true },
    });
    const completedIds = new Set(completedProgress.map((p) => p.inspectionItemId));

    // Run matching algorithm
    match = matchMeasurementToItem(
      { value, unit },
      candidates,
      session.activeInspectionSectionId,
      completedIds
    );

    assignedItemId = match && match.confidence >= HIGH_CONFIDENCE ? match.itemId : null;
  }

  // Determine confidence level for the response
  let confidenceLevel: "high" | "medium" | "none" = "none";
  if (match) {
    confidenceLevel = match.confidence >= HIGH_CONFIDENCE ? "high" : "medium";
  }

  // Create the measurement record
  const measurement = await prisma.measurement.create({
    data: {
      captureSessionId: sessionId,
      componentId: session.componentId,
      inspectionItemId: assignedItemId,
      measurementType: "glasses_capture",
      parameterName: match?.parameterName || `Glasses: ${value} ${unit}`,
      value,
      unit,
      confidence: glassesConfidence ?? (match?.confidence || 0),
      status: assignedItemId ? "confirmed" : "pending",
      measuredAt: body.timestamp ? new Date(body.timestamp) : new Date(),
      sources: {
        create: {
          sourceType: "glasses_capture",
          value,
          unit,
          confidence: glassesConfidence ?? 0.8,
        },
      },
    },
  });

  // If high confidence, also create/update the inspection progress record
  if (assignedItemId) {
    const inTolerance =
      match && candidates.find((c) => c.id === assignedItemId)
        ? isInTolerance(value, candidates.find((c) => c.id === assignedItemId)!)
        : null;

    await prisma.inspectionProgress.upsert({
      where: {
        captureSessionId_inspectionItemId: {
          captureSessionId: sessionId,
          inspectionItemId: assignedItemId,
        },
      },
      create: {
        captureSessionId: sessionId,
        inspectionItemId: assignedItemId,
        status: "done",
        result: inTolerance === false ? "out_of_spec" : "in_spec",
        measurementId: measurement.id,
        completedAt: new Date(),
        completedById: userId,
      },
      update: {
        status: "done",
        result: inTolerance === false ? "out_of_spec" : "in_spec",
        measurementId: measurement.id,
        completedAt: new Date(),
        completedById: userId,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      assignedToItemId: assignedItemId,
      confidence: confidenceLevel,
      measurementId: measurement.id,
      match: match
        ? { itemId: match.itemId, parameterName: match.parameterName, itemCallout: match.itemCallout }
        : null,
    },
  });
}

// Handle a photo from the glasses
async function handlePhoto(
  body: { imageUrl: string; timestamp?: string; inspectionItemId?: string },
  session: { id: string; organizationId: string },
  sessionId: string
) {
  if (!body.imageUrl) {
    return NextResponse.json({ success: false, error: "Missing imageUrl" }, { status: 400 });
  }

  // Validate URL — must be HTTPS to prevent XSS/SSRF via javascript: or data: URIs
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.imageUrl);
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json({ success: false, error: "imageUrl must use HTTPS" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Invalid imageUrl" }, { status: 400 });
  }

  // Infer mime type from extension, default to jpeg
  const ext = parsedUrl.pathname.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "heic" ? "image/heic" : "image/jpeg";

  const evidence = await prisma.captureEvidence.create({
    data: {
      sessionId,
      type: "PHOTO",
      fileUrl: body.imageUrl,
      mimeType,
      capturedAt: body.timestamp ? new Date(body.timestamp) : new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      evidenceId: evidence.id,
      type: "photo",
    },
  });
}

// Helper: check if a value is within the item's spec range
function isInTolerance(value: number, item: CandidateItem): boolean | null {
  if (item.specValueLow == null && item.specValueHigh == null) return null;
  const low = item.specValueLow ?? -Infinity;
  const high = item.specValueHigh ?? Infinity;
  return value >= low && value <= high;
}

