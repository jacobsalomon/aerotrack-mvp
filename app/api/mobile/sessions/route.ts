// GET /api/mobile/sessions — List user's capture sessions
// POST /api/mobile/sessions — Start a new capture session
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { decorateSessionWithProgress } from "@/lib/session-progress";
import { scheduleSessionProcessingIfNeeded } from "@/lib/session-processing-jobs";
import { NextResponse } from "next/server";

// List the user's sessions (most recent first)
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {
    userId: auth.user.id,
  };
  if (status) where.status = status;

  const sessions = await prisma.captureSession.findMany({
    where,
    include: {
      _count: { select: { evidence: true, documents: true } },
      processingJob: {
        include: {
          stages: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      packages: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  await Promise.all(sessions.map((session) => scheduleSessionProcessingIfNeeded(session)));

  return NextResponse.json({
    success: true,
    data: sessions.map((session) => decorateSessionWithProgress(session)),
  });
}

// Start a new capture session
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { description, shiftSessionId } = body;

    let linkedShiftId: string | null = null;

    if (typeof shiftSessionId === "string" && shiftSessionId.trim().length > 0) {
      const shift = await prisma.shiftSession.findUnique({
        where: { id: shiftSessionId },
        select: { id: true, userId: true, organizationId: true },
      });

      if (!shift) {
        return NextResponse.json(
          { success: false, error: "Shift not found" },
          { status: 404 }
        );
      }

      if (
        shift.userId !== auth.user.id ||
        shift.organizationId !== auth.user.organizationId
      ) {
        return NextResponse.json(
          { success: false, error: "Not authorized to link this shift" },
          { status: 403 }
        );
      }

      linkedShiftId = shift.id;
    } else {
      const activeShift = await prisma.shiftSession.findFirst({
        where: {
          userId: auth.user.id,
          organizationId: auth.user.organizationId,
          status: { in: ["active", "paused"] },
        },
        select: { id: true },
        orderBy: { startedAt: "desc" },
      });
      linkedShiftId = activeShift?.id ?? null;
    }

    const session = await prisma.captureSession.create({
      data: {
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
        shiftSessionId: linkedShiftId,
        description: description || null,
        status: "capturing",
      },
    });

    // Log it
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
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
