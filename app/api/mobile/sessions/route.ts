// GET /api/mobile/sessions — List technician's capture sessions
// POST /api/mobile/sessions — Start a new capture session
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

// List the technician's sessions (most recent first)
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {
    technicianId: auth.technician.id,
  };
  if (status) where.status = status;

  const sessions = await prisma.captureSession.findMany({
    where,
    include: {
      _count: { select: { evidence: true, documents: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ success: true, data: sessions });
}

// Start a new capture session
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { description } = body;

    const session = await prisma.captureSession.create({
      data: {
        technicianId: auth.technician.id,
        organizationId: auth.technician.organizationId,
        description: description || null,
        status: "capturing",
      },
    });

    // Log it
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "session_started",
        entityType: "CaptureSession",
        entityId: session.id,
      },
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create session" },
      { status: 500 }
    );
  }
}
