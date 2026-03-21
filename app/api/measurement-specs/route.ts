// POST /api/measurement-specs — Create a new measurement spec (checklist template)
// GET  /api/measurement-specs — List all specs for the authenticated user's org
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { name, componentPartNumber, specItems, status } = body;

    if (!name || !specItems) {
      return NextResponse.json(
        { success: false, error: "name and specItems are required" },
        { status: 400 }
      );
    }

    // Validate specItems is an array with required fields
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

    if (!auth.user.organizationId) {
      return NextResponse.json({ success: false, error: "Organization required" }, { status: 400 });
    }

    const spec = await prisma.measurementSpec.create({
      data: {
        organizationId: auth.user.organizationId,
        name,
        componentPartNumber: componentPartNumber || null,
        specItemsJson: specItems,
        status: status || "draft",
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...spec, specItems: spec.specItemsJson },
    }, { status: 201 });
  } catch (error) {
    console.error("Create measurement spec error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create measurement spec" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const partNumber = searchParams.get("partNumber");

    const specs = await prisma.measurementSpec.findMany({
      where: {
        organizationId: auth.user.organizationId ?? undefined,
        ...(status && { status }),
        ...(partNumber && { componentPartNumber: partNumber }),
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: specs.map((s) => ({
        ...s,
        specItems: s.specItemsJson,
      })),
    });
  } catch (error) {
    console.error("List measurement specs error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list measurement specs" },
      { status: 500 }
    );
  }
}
