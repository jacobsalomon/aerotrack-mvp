import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { guardSignedOff, checkInspectionTolerance } from "@/lib/inspect/inspection-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
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
    const { measurementId, inspectionItemId } = body;

    if (!measurementId || !inspectionItemId) {
      return NextResponse.json({ success: false, error: "measurementId and inspectionItemId are required" }, { status: 400 });
    }

    // Verify measurement belongs to this session and is unassigned
    const measurement = await prisma.measurement.findUnique({ where: { id: measurementId } });
    if (!measurement || measurement.captureSessionId !== id) {
      return NextResponse.json({ success: false, error: "Measurement not found in this session" }, { status: 404 });
    }
    if (measurement.inspectionItemId) {
      return NextResponse.json({ success: false, error: "Measurement is already assigned" }, { status: 400 });
    }

    // Load target item for tolerance check
    const item = await prisma.inspectionItem.findUnique({ where: { id: inspectionItemId } });
    if (!item) {
      return NextResponse.json({ success: false, error: "Inspection item not found" }, { status: 404 });
    }

    const toleranceResult = checkInspectionTolerance(measurement.value, item.specValueLow, item.specValueHigh);

    await prisma.$transaction(async (tx) => {
      // Assign measurement to item
      await tx.measurement.update({
        where: { id: measurementId },
        data: {
          inspectionItemId,
          toleranceLow: item.specValueLow,
          toleranceHigh: item.specValueHigh,
          inTolerance: toleranceResult === "in_spec" ? true : toleranceResult === "out_of_spec" ? false : null,
          status: toleranceResult === "out_of_spec" ? "out_of_tolerance" : "confirmed",
        },
      });

      // Update progress
      await tx.inspectionProgress.upsert({
        where: {
          captureSessionId_inspectionItemId: {
            captureSessionId: id,
            inspectionItemId,
          },
        },
        create: {
          captureSessionId: id,
          inspectionItemId,
          status: toleranceResult === "out_of_spec" ? "problem" : "done",
          result: toleranceResult || "in_spec",
          measurementId,
          completedAt: new Date(),
          completedById: authResult.user.id,
        },
        update: {
          status: toleranceResult === "out_of_spec" ? "problem" : "done",
          result: toleranceResult || "in_spec",
          measurementId,
          completedAt: new Date(),
          completedById: authResult.user.id,
        },
      });
    });

    return NextResponse.json({ success: true, data: { assigned: true, toleranceResult } });
  } catch (error) {
    console.error("[inspect/assign POST]", error);
    return NextResponse.json({ success: false, error: "Failed to assign measurement" }, { status: 500 });
  }
}
