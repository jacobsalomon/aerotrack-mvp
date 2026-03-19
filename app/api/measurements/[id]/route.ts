// GET   /api/measurements/[id] — Get measurement detail with all sources
// PATCH /api/measurements/[id] — Confirm, flag, or override a measurement
// GET is open for web dashboard; PATCH requires Bearer auth

import { authenticateRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

// Open for dashboard — no Bearer token required
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const measurement = await prisma.measurement.findUnique({
      where: { id },
      include: {
        sources: { orderBy: { createdAt: "asc" } },
        component: { select: { partNumber: true, serialNumber: true } },
      },
    });

    if (!measurement) {
      return NextResponse.json(
        { success: false, error: "Measurement not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: measurement });
  } catch (error) {
    console.error("Get measurement error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get measurement" },
      { status: 500 }
    );
  }
}

// PATCH requires Bearer auth
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const existing = await prisma.measurement.findUnique({
      where: { id },
      include: { captureSession: { select: { organizationId: true } } },
    });

    if (!existing || existing.captureSession?.organizationId !== auth.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Measurement not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action, reason, value } = body;

    if (!action || !["confirm", "flag", "override"].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "confirm", "flag", or "override"' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    switch (action) {
      case "confirm":
        updateData.status = "confirmed";
        break;
      case "flag":
        updateData.status = "flagged";
        updateData.flagReason = reason || "Manually flagged";
        break;
      case "override": {
        if (value === undefined) {
          return NextResponse.json(
            { success: false, error: "value is required for override" },
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
        updateData.status = "overridden";
        updateData.value = numericValue;
        updateData.overrideReason = reason || "Manual override";
        updateData.overriddenBy = auth.user.badgeNumber;
        updateData.overriddenAt = new Date();
        // Re-check tolerance with new value
        if (existing.toleranceLow !== null || existing.toleranceHigh !== null) {
          updateData.inTolerance =
            (existing.toleranceLow === null || numericValue >= existing.toleranceLow) &&
            (existing.toleranceHigh === null || numericValue <= existing.toleranceHigh);
        }
        break;
      }
    }

    const measurement = await prisma.measurement.update({
      where: { id },
      data: updateData,
      include: { sources: true },
    });

    return NextResponse.json({ success: true, data: measurement });
  } catch (error) {
    console.error("Update measurement error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update measurement" },
      { status: 500 }
    );
  }
}
