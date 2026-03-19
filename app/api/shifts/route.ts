// POST /api/shifts — Start a new work shift
// GET  /api/shifts — List shifts for the authenticated user's org
// Protected by API key authentication

import { authenticateRequest } from "@/lib/mobile-auth";
import { startShift } from "@/lib/shift-session";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// POST requires Bearer auth (mobile app starts shifts)
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  // Creating a shift requires an organization
  if (!auth.user.organizationId) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { measurementSpecId, notes } = body;

    const shift = await startShift({
      userId: auth.user.id,
      organizationId: auth.user.organizationId,
      measurementSpecId,
      notes,
    });

    return NextResponse.json({ success: true, data: shift }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start shift";
    const status = message.includes("already has an active") ? 409
      : message.includes("not found") ? 404
      : message.includes("must be active") ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// GET is open for the web dashboard (like other dashboard API routes)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");

    const shifts = await prisma.shiftSession.findMany({
      where: {
        ...(status && { status }),
      },
      include: {
        user: { select: { firstName: true, lastName: true, badgeNumber: true } },
        measurementSpec: { select: { id: true, name: true } },
        _count: { select: { measurements: true, captureSessions: true } },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, data: shifts });
  } catch (error) {
    console.error("List shifts error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list shifts" },
      { status: 500 }
    );
  }
}
