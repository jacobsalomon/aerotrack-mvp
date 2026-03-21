// Layer 3 US-008: Unassigned measurements endpoint
// Returns measurements that the AI captured but couldn't assign to a template item

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
      select: { organizationId: true, sessionType: true },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    // Fetch measurements where inspectionItemId is null (unassigned)
    const unassigned = await prisma.measurement.findMany({
      where: {
        captureSessionId: id,
        inspectionItemId: null,
      },
      select: {
        id: true,
        parameterName: true,
        measurementType: true,
        value: true,
        unit: true,
        confidence: true,
        measuredAt: true,
        sources: {
          select: {
            id: true,
            sourceType: true,
            rawExcerpt: true,
            confidence: true,
          },
        },
      },
      orderBy: { measuredAt: "asc" },
    });

    // Also return reconciliation conflicts if available
    const sessionWithRecon = await prisma.captureSession.findUnique({
      where: { id },
      select: { reconciliationSummary: true },
    });

    const conflicts = sessionWithRecon?.reconciliationSummary
      ? (sessionWithRecon.reconciliationSummary as Record<string, unknown>)?.conflicts ?? []
      : [];

    return NextResponse.json({
      success: true,
      data: {
        unassigned,
        conflicts,
        count: unassigned.length,
      },
    });
  } catch (error) {
    console.error("[inspect/sessions/[id]/unassigned GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load unassigned measurements" }, { status: 500 });
  }
}
