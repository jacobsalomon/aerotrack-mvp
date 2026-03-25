import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  guardSignedOff,
  getInspectionProgressSummary,
  getSectionProgress,
} from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;

    const session = await prisma.captureSession.findUnique({
      where: { id },
      include: {
        inspectionTemplate: {
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                items: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
        user: {
          select: { id: true, name: true, firstName: true, lastName: true, badgeNumber: true },
        },
        inspectionProgress: {
          include: {
            measurement: true,
            inspectionItem: true,
          },
        },
        inspectionFindings: true,
      },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.sessionType !== "inspection") {
      return NextResponse.json({ success: false, error: "Not an inspection session" }, { status: 400 });
    }

    const summary = await getInspectionProgressSummary(id);
    const sectionProgress = session.inspectionTemplateId
      ? await getSectionProgress(id, session.inspectionTemplateId)
      : [];

    // Get unassigned measurements (measurements in this session without an inspectionItemId)
    const unassignedMeasurements = await prisma.measurement.findMany({
      where: {
        captureSessionId: id,
        inspectionItemId: null,
      },
      include: {
        sources: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        session,
        summary,
        sectionProgress,
        unassignedMeasurements,
      },
    });
  } catch (error) {
    console.error("[inspect/sessions/[id] GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load inspection session" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.captureSession.findUnique({ where: { id } });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    const guard = guardSignedOff(session);
    if (guard) return guard;

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Allow updating work order reference at any time
    if (body.workOrderRef !== undefined) {
      updates.workOrderRef = body.workOrderRef || null;
    }

    if (body.activeInspectionSectionId !== undefined) {
      updates.activeInspectionSectionId = body.activeInspectionSectionId;
    }

    // CMM revision acknowledgement — stores timestamp and user ID
    if (body.cmmRevisionAcknowledged === true) {
      updates.cmmRevisionAcknowledgedAt = new Date();
      updates.cmmRevisionAcknowledgedById = authResult.user.id;
    }
    if (body.status !== undefined) {
      // Only allow valid transitions
      const validStatuses = ["inspecting", "reviewing", "cancelled"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ success: false, error: `Invalid status: ${body.status}` }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === "cancelled") {
        updates.completedAt = new Date();
      }
    }

    const updated = await prisma.captureSession.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[inspect/sessions/[id] PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update session" }, { status: 500 });
  }
}
