// Layer 2+3: Inspection progress polling endpoint
// Returns up-to-date item statuses including AI auto-assignment results.
// Layer 3 additions: capturedValue, capturedAt, autoAssigned, summary counts.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;

    // Verify session ownership
    const session = await prisma.captureSession.findUnique({
      where: { id },
      select: { organizationId: true, sessionType: true, inspectionTemplateId: true },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    const where: Record<string, unknown> = { captureSessionId: id };
    if (since) {
      where.updatedAt = { gt: new Date(since) };
    }

    // Load progress with measurement data for Layer 3 enrichment
    const progress = await prisma.inspectionProgress.findMany({
      where,
      include: {
        measurement: {
          select: {
            id: true,
            value: true,
            unit: true,
            measuredAt: true,
            inTolerance: true,
            status: true,
            sources: {
              select: { sourceType: true },
              take: 1,
              orderBy: { createdAt: "asc" },
            },
          },
        },
        inspectionItem: {
          select: {
            id: true,
            parameterName: true,
            itemCallout: true,
            specValueLow: true,
            specValueHigh: true,
            specUnit: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    // Enrich each progress entry with Layer 3 data
    const enrichedProgress = progress.map((p) => {
      // Derive autoAssigned: true if measurement source is audio_callout or video_frame
      const primarySource = p.measurement?.sources?.[0]?.sourceType;
      const autoAssigned = primarySource === "audio_callout" || primarySource === "video_frame";

      return {
        ...p,
        // Layer 3 fields
        capturedValue: p.measurement?.value ?? null,
        capturedUnit: p.measurement?.unit ?? null,
        capturedAt: p.measurement?.measuredAt ?? null,
        measurementId: p.measurement?.id ?? null,
        autoAssigned,
      };
    });

    // Build summary counts
    // Count all progress records (instances), not just unique items
    const allProgress = since
      ? await prisma.inspectionProgress.findMany({
          where: { captureSessionId: id },
          select: { status: true, result: true },
        })
      : progress;

    const totalItems = allProgress.length;
    const matched = allProgress.filter((p) => p.status === "done" || p.status === "problem").length;
    const passed = allProgress.filter((p) => p.result === "in_spec" || p.result === "pass").length;
    const failed = allProgress.filter((p) => p.result === "out_of_spec" || p.result === "fail").length;
    const pending = totalItems - matched;

    const unassignedMeasurements = await prisma.measurement.count({
      where: {
        captureSessionId: id,
        inspectionItemId: null,
      },
    });

    // lastMatchedAt: most recent progress update time
    const lastProgress = await prisma.inspectionProgress.findFirst({
      where: { captureSessionId: id },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    // Count photo evidence for badge
    const photoCount = await prisma.captureEvidence.count({
      where: { sessionId: id, type: "PHOTO" },
    });

    return NextResponse.json({
      success: true,
      data: enrichedProgress,
      summary: {
        total: totalItems,
        matched,
        passed,
        failed,
        pending,
        unassignedMeasurements,
        lastMatchedAt: lastProgress?.updatedAt ?? null,
      },
      photoCount,
    });
  } catch (error) {
    console.error("[inspect/sessions/[id]/progress GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load progress" }, { status: 500 });
  }
}
