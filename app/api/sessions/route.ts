// GET /api/sessions — List all capture sessions for the web dashboard
// Includes user info, evidence counts, and document counts
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

    // Cross-org isolation: require an organization — never return unscoped data
    if (!authResult.user.organizationId) {
      return NextResponse.json({ error: "No organization assigned" }, { status: 403 });
    }

    const where: Record<string, unknown> = {
      organizationId: authResult.user.organizationId,
    };
    if (status && status !== "all") where.status = status;

    const sessions = await prisma.captureSession.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
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
          select: { id: true, partNumber: true, serialNumber: true, description: true },
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
// Uses the authenticated user's ID directly (same ID that mobile auth resolves)
// so that sessions created here are visible to the iOS Glass app.
export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { description, targetFormType, orgDocumentId, workOrderRef, forGlasses } = body;
    const user = authResult.user;

    // Require org membership — matches the check in mobile auth
    if (!user.organizationId) {
      return NextResponse.json(
        { error: "No organization assigned. Please join one at the dashboard first." },
        { status: 400 }
      );
    }

    // "active" = ready for glasses capture (iOS app will pick it up)
    // "capturing" = web desk-mic capture (live view shown immediately)
    const initialStatus = forGlasses ? "active" : "capturing";

    // If creating a glasses job, deactivate any other active sessions
    if (forGlasses) {
      await prisma.captureSession.updateMany({
        where: {
          userId: user.id,
          status: "active",
        },
        data: { status: "paused" },
      });
    }

    const session = await prisma.captureSession.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        description: description || "Web capture session",
        targetFormType: orgDocumentId ? null : (targetFormType || null),
        orgDocumentId: orgDocumentId || null,
        workOrderRef: workOrderRef || null,
        status: initialStatus,
      },
    });

    await prisma.auditLogEntry.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
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
