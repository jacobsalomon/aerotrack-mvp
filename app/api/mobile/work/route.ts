// GET /api/mobile/work — Get the user's active capture session status
// POST /api/mobile/work — Start or resume a capture session
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!auth.user.organizationId) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 400 }
    );
  }

  try {
    const activeSession = await prisma.captureSession.findFirst({
      where: {
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
        status: "capturing",
      },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: { activeSession },
    });
  } catch (error) {
    console.error("Get mobile work status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load work status" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!auth.user.organizationId) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const description =
      typeof body?.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : undefined;

    // Check for an already-active session
    const current = await prisma.captureSession.findFirst({
      where: {
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
        status: "capturing",
      },
      orderBy: { startedAt: "desc" },
    });

    if (current) {
      return NextResponse.json({ success: true, data: current });
    }

    // Create a new capture session
    const session = await prisma.captureSession.create({
      data: {
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
        description: description || "Mobile capture session",
        status: "capturing",
      },
    });

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start work";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
