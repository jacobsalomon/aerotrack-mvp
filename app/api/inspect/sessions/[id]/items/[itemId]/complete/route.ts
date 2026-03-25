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

    // Load session
    const session = await prisma.captureSession.findUnique({ where: { id } });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    const guard = guardSignedOff(session);
    if (guard) return guard;

    // Load the inspection item for spec info
    const item = await prisma.inspectionItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return NextResponse.json({ success: false, error: "Inspection item not found" }, { status: 404 });
    }

    const body = await request.json();
    const { value, unit, notes, result: manualResult } = body;
    const instanceIndex = body.instanceIndex ?? 0;

    // Validate instanceIndex is within bounds
    if (instanceIndex < 0 || instanceIndex >= item.instanceCount) {
      return NextResponse.json({ success: false, error: `Invalid instanceIndex ${instanceIndex} (item has ${item.instanceCount} instances)` }, { status: 400 });
    }

    // For pass/fail items (visual_check, procedural_check), no numeric value needed
    const isPassFail = ["visual_check", "procedural_check", "safety_wire"].includes(item.itemType);

    let measurement = null;
    let toleranceResult: string | null = null;

    if (!isPassFail) {
      // Numeric item — create measurement
      if (value == null || unit == null) {
        return NextResponse.json({ success: false, error: "value and unit are required for numeric items" }, { status: 400 });
      }

      toleranceResult = checkInspectionTolerance(value, item.specValueLow, item.specValueHigh);

      measurement = await prisma.measurement.create({
        data: {
          captureSessionId: id,
          componentId: session.componentId,
          inspectionItemId: itemId,
          instanceIndex,
          measurementType: item.itemType,
          parameterName: item.parameterName,
          value,
          unit,
          nominalValue: item.specValueLow != null && item.specValueHigh != null
            ? (item.specValueLow + item.specValueHigh) / 2
            : null,
          toleranceLow: item.specValueLow,
          toleranceHigh: item.specValueHigh,
          inTolerance: toleranceResult === "in_spec" ? true : toleranceResult === "out_of_spec" ? false : null,
          confidence: 1.0,
          corroborationLevel: "single",
          status: toleranceResult === "out_of_spec" ? "out_of_tolerance" : "confirmed",
          measuredAt: new Date(),
          sources: {
            create: {
              sourceType: "manual_entry",
              value,
              unit,
              confidence: 1.0,
            },
          },
        },
      });
    }

    // Determine progress status and result
    const progressStatus = toleranceResult === "out_of_spec" || manualResult === "fail" ? "problem" : "done";
    const progressResult = isPassFail
      ? (manualResult === "pass" ? "pass" : manualResult === "fail" ? "fail" : "pass")
      : (toleranceResult || "pass");

    // Upsert InspectionProgress
    await prisma.inspectionProgress.upsert({
      where: {
        captureSessionId_inspectionItemId_instanceIndex: {
          captureSessionId: id,
          inspectionItemId: itemId,
          instanceIndex,
        },
      },
      create: {
        captureSessionId: id,
        inspectionItemId: itemId,
        instanceIndex,
        status: progressStatus,
        result: progressResult,
        measurementId: measurement?.id || null,
        notes: notes || null,
        completedAt: new Date(),
        completedById: authResult.user.id,
      },
      update: {
        status: progressStatus,
        result: progressResult,
        measurementId: measurement?.id || null,
        notes: notes || null,
        completedAt: new Date(),
        completedById: authResult.user.id,
      },
    });

    return NextResponse.json({ success: true, data: { measurement, progressStatus, progressResult } }, { status: 201 });
  } catch (error) {
    console.error("[inspect/complete POST]", error);
    return NextResponse.json({ success: false, error: "Failed to complete item" }, { status: 500 });
  }
}
