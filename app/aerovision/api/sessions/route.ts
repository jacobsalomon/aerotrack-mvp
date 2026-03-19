// GET /api/sessions — List all capture sessions for the web dashboard
// Includes technician info, evidence counts, and document counts
// Protected by dashboard auth (passcode cookie)

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { decorateSessionWithProgress } from "@/lib/session-progress";
import { scheduleSessionProcessingIfNeeded } from "@/lib/session-processing-jobs";
import { buildSessionApiErrorResponse } from "@/lib/session-api-error";

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;

    const sessions = await prisma.captureSession.findMany({
      where,
      include: {
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            badgeNumber: true,
          },
        },
        organization: {
          select: { name: true },
        },
        _count: {
          select: {
            evidence: true,
            documents: true,
          },
        },
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
      take: 100,
    });

    await Promise.all(
      sessions.map((session) => scheduleSessionProcessingIfNeeded(session))
    );

    // Look up linked components so the UI can show part info per session
    const componentIds = [...new Set(sessions.map((s) => s.componentId).filter(Boolean))] as string[];
    const components = componentIds.length
      ? await prisma.component.findMany({
          where: { id: { in: componentIds } },
          select: { id: true, partNumber: true, description: true },
        })
      : [];
    const componentMap = Object.fromEntries(components.map((c) => [c.id, c]));

    return NextResponse.json(
      sessions.map((session) => ({
        ...decorateSessionWithProgress(session),
        component: session.componentId ? componentMap[session.componentId] ?? null : null,
      }))
    );
  } catch (error) {
    console.error("List sessions error:", error);
    return buildSessionApiErrorResponse(error, "queue");
  }
}

// Start a new capture session from the web dashboard (no glasses required).
// The technician picks the logged-in user's technician record.
export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { description } = body;

    // Use the first technician in the demo org as the session owner.
    // In production this would use the logged-in user's technician record.
    const technician = await prisma.technician.findFirst({
      select: { id: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    });

    if (!technician) {
      return NextResponse.json(
        { error: "No technician found" },
        { status: 404 }
      );
    }

    // Find the active shift for this technician (if any)
    const activeShift = await prisma.shiftSession.findFirst({
      where: {
        technicianId: technician.id,
        status: { in: ["active", "paused"] },
      },
      select: { id: true },
      orderBy: { startedAt: "desc" },
    });

    const session = await prisma.captureSession.create({
      data: {
        technicianId: technician.id,
        organizationId: technician.organizationId,
        shiftSessionId: activeShift?.id ?? null,
        description: description || "Web capture session",
        status: "capturing",
      },
    });

    await prisma.auditLogEntry.create({
      data: {
        organizationId: technician.organizationId,
        technicianId: technician.id,
        action: "session_started",
        entityType: "CaptureSession",
        entityId: session.id,
        metadata: JSON.stringify({ source: "web_dashboard" }),
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Create web session error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
