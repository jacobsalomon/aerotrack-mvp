// GET    /api/measurement-specs/[id] — Get a single measurement spec
// PATCH  /api/measurement-specs/[id] — Update a spec (name, items, status)
// DELETE /api/measurement-specs/[id] — Delete a spec (only if no shifts use it)
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const spec = await prisma.measurementSpec.findUnique({
      where: { id },
      include: { _count: { select: { shiftSessions: true } } },
    });

    if (!spec || spec.organizationId !== auth.technician.organizationId) {
      return NextResponse.json(
        { success: false, error: "Measurement spec not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...spec,
        specItems: JSON.parse(spec.specItemsJson),
        shiftsUsingThis: spec._count.shiftSessions,
      },
    });
  } catch (error) {
    console.error("Get measurement spec error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get measurement spec" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    // Verify ownership
    const existing = await prisma.measurementSpec.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== auth.technician.organizationId) {
      return NextResponse.json(
        { success: false, error: "Measurement spec not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, componentPartNumber, specItems, status } = body;

    // Validate specItems if provided
    if (specItems !== undefined) {
      if (!Array.isArray(specItems) || specItems.length === 0) {
        return NextResponse.json(
          { success: false, error: "specItems must be a non-empty array" },
          { status: 400 }
        );
      }
      for (const item of specItems) {
        if (!item.parameterName || !item.measurementType || !item.unit) {
          return NextResponse.json(
            { success: false, error: "Each specItem needs parameterName, measurementType, and unit" },
            { status: 400 }
          );
        }
      }
    }

    const spec = await prisma.measurementSpec.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(componentPartNumber !== undefined && { componentPartNumber }),
        ...(specItems !== undefined && { specItemsJson: JSON.stringify(specItems) }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...spec, specItems: JSON.parse(spec.specItemsJson) },
    });
  } catch (error) {
    console.error("Update measurement spec error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update measurement spec" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const existing = await prisma.measurementSpec.findUnique({
      where: { id },
      include: { _count: { select: { shiftSessions: true } } },
    });

    if (!existing || existing.organizationId !== auth.technician.organizationId) {
      return NextResponse.json(
        { success: false, error: "Measurement spec not found" },
        { status: 404 }
      );
    }

    if (existing._count.shiftSessions > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete — ${existing._count.shiftSessions} shift(s) use this spec. Archive it instead.` },
        { status: 409 }
      );
    }

    await prisma.measurementSpec.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete measurement spec error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete measurement spec" },
      { status: 500 }
    );
  }
}
