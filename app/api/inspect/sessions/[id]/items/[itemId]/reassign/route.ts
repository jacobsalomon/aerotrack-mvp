import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff, checkInspectionTolerance } from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
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

    const body = await request.json();
    const { targetItemId } = body;
    if (!targetItemId) {
      return NextResponse.json({ success: false, error: "targetItemId is required" }, { status: 400 });
    }

    // Find the current progress record to get the measurement
    const currentProgress = await prisma.inspectionProgress.findUnique({
      where: {
        captureSessionId_inspectionItemId: {
          captureSessionId: id,
          inspectionItemId: itemId,
        },
      },
    });

    if (!currentProgress?.measurementId) {
      return NextResponse.json({ success: false, error: "No measurement to reassign" }, { status: 400 });
    }

    // Load target item for tolerance check
    const targetItem = await prisma.inspectionItem.findUnique({ where: { id: targetItemId } });
    if (!targetItem) {
      return NextResponse.json({ success: false, error: "Target item not found" }, { status: 404 });
    }

    const measurement = await prisma.measurement.findUnique({ where: { id: currentProgress.measurementId } });
    if (!measurement) {
      return NextResponse.json({ success: false, error: "Measurement not found" }, { status: 404 });
    }

    const toleranceResult = checkInspectionTolerance(measurement.value, targetItem.specValueLow, targetItem.specValueHigh);

    await prisma.$transaction(async (tx) => {
      // Reset source progress
      await tx.inspectionProgress.update({
        where: {
          captureSessionId_inspectionItemId: {
            captureSessionId: id,
            inspectionItemId: itemId,
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

      // Move measurement to target item
      await tx.measurement.update({
        where: { id: measurement.id },
        data: { inspectionItemId: targetItemId },
      });

      // Update target progress
      await tx.inspectionProgress.upsert({
        where: {
          captureSessionId_inspectionItemId: {
            captureSessionId: id,
            inspectionItemId: targetItemId,
          },
        },
        create: {
          captureSessionId: id,
          inspectionItemId: targetItemId,
          status: toleranceResult === "out_of_spec" ? "problem" : "done",
          result: toleranceResult || "in_spec",
          measurementId: measurement.id,
          completedAt: new Date(),
          completedById: authResult.user.id,
        },
        update: {
          status: toleranceResult === "out_of_spec" ? "problem" : "done",
          result: toleranceResult || "in_spec",
          measurementId: measurement.id,
          completedAt: new Date(),
          completedById: authResult.user.id,
        },
      });
    });

    return NextResponse.json({ success: true, data: { reassigned: true } });
  } catch (error) {
    console.error("[inspect/reassign POST]", error);
    return NextResponse.json({ success: false, error: "Failed to reassign measurement" }, { status: 500 });
  }
}
