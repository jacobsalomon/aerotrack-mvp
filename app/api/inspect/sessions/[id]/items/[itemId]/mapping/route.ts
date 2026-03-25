import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff } from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id, itemId } = await params;
    const session = await prisma.captureSession.findUnique({ where: { id } });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    const guard = guardSignedOff(session);
    if (guard) return guard;

    const progress = await prisma.inspectionProgress.findUnique({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: id,
          inspectionItemId: itemId,
          instanceIndex: 0,
        },
      },
    });

    if (!progress?.measurementId) {
      return NextResponse.json({ success: false, error: "No mapping to undo" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // Unlink measurement from item (becomes unassigned)
      await tx.measurement.update({
        where: { id: progress.measurementId! },
        data: { inspectionItemId: null },
      });

      // Reset progress to pending
      await tx.inspectionProgress.update({
        where: {
          captureSessionId_inspectionItemId_instanceIndex: {
            captureSessionId: id,
            inspectionItemId: itemId,
            instanceIndex: 0,
          },
        },
        data: {
          status: "pending",
          result: null,
          measurementId: null,
          completedAt: null,
          completedById: null,
        },
      });
    });

    return NextResponse.json({ success: true, data: { undone: true } });
  } catch (error) {
    console.error("[inspect/mapping DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to undo mapping" }, { status: 500 });
  }
}
