// GET  /api/shifts/[id]/measurements — List measurements (supports polling with ?since=)
// POST /api/shifts/[id]/measurements — Manual measurement entry
// GET is open for the web dashboard; POST requires Bearer auth

import { authenticateRequest } from "@/lib/mobile-auth";
import { recordMeasurement, getSpecProgress } from "@/lib/measurement-ledger";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

// Open for dashboard — no Bearer token required
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const status = searchParams.get("status");

  try {
    const shift = await prisma.shiftSession.findUnique({ where: { id } });
    if (!shift) {
      return NextResponse.json(
        { success: false, error: "Shift not found" },
        { status: 404 }
      );
    }

    const measurements = await prisma.measurement.findMany({
      where: {
        shiftSessionId: id,
        ...(since && { updatedAt: { gte: new Date(since) } }),
        ...(status && { status }),
      },
      include: {
        sources: true,
        component: { select: { partNumber: true, serialNumber: true } },
      },
      orderBy: { sequenceInShift: "asc" },
    });

    const specProgress = await getSpecProgress(id);

    return NextResponse.json({
      success: true,
      data: measurements,
      specProgress,
      polledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("List measurements error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list measurements" },
      { status: 500 }
    );
  }
}

// POST requires Bearer auth (mobile app or API client)
export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      componentId,
      measurementType,
      parameterName,
      value,
      unit,
      procedureStep,
      taskCardRef,
    } = body;

    if (!measurementType || !parameterName || value === undefined || !unit) {
      return NextResponse.json(
        { success: false, error: "measurementType, parameterName, value, and unit are required" },
        { status: 400 }
      );
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      return NextResponse.json(
        { success: false, error: "value must be a valid number" },
        { status: 400 }
      );
    }

    const measurement = await recordMeasurement({
      shiftSessionId: id,
      componentId,
      measurementType,
      parameterName,
      value: numericValue,
      unit,
      source: {
        sourceType: "manual_entry",
        confidence: 1.0,
        rawExcerpt: `Manual entry: ${parameterName} = ${value} ${unit}`,
      },
      procedureStep,
      taskCardRef,
    });

    return NextResponse.json({ success: true, data: measurement }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record measurement";
    const status = message.includes("not found") ? 404
      : message.includes("not active") ? 409
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
