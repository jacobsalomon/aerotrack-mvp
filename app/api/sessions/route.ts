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

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;

    const sessions = await prisma.captureSession.findMany({
      where,
      include: {
        user: {
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
// Looks up (or auto-creates) a User profile for the logged-in user,
// creates a ShiftSession for mic recording / measurements, then creates
// the CaptureSession linked to both.
export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { description } = body;
    const user = authResult.user;

    // Look up user profile by the logged-in user's email
    let userProfile = user.email
      ? await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, organizationId: true },
        })
      : null;

    // Auto-create a user profile if one doesn't exist yet
    if (!userProfile) {
      // Use the first organization as the default (production has one org)
      const org = await prisma.organization.findFirst({
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });

      if (!org) {
        return NextResponse.json(
          { error: "No organization found. Please contact support." },
          { status: 500 }
        );
      }

      // Split the user's display name into first/last
      const nameParts = (user.name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "User";
      const lastName = nameParts.slice(1).join(" ") || user.email?.split("@")[0] || "Unknown";

      // Generate a badge number from the user ID
      const badgeNumber = `WEB-${user.id.slice(-6).toUpperCase()}`;

      userProfile = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email: user.email || `${user.id}@aerovision.local`,
          badgeNumber,
          organizationId: org.id,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
        select: { id: true, organizationId: true },
      });
    }

    if (!userProfile.organizationId) {
      return NextResponse.json(
        { error: "User has no organization. Please contact support." },
        { status: 400 }
      );
    }

    // Create a ShiftSession so mic recording and measurement extraction work
    const shiftSession = await prisma.shiftSession.create({
      data: {
        userId: userProfile.id,
        organizationId: userProfile.organizationId,
        status: "active",
        startedAt: new Date(),
      },
    });

    const session = await prisma.captureSession.create({
      data: {
        userId: userProfile.id,
        organizationId: userProfile.organizationId,
        shiftSessionId: shiftSession.id,
        description: description || "Web capture session",
        status: "capturing",
      },
    });

    await prisma.auditLogEntry.create({
      data: {
        organizationId: userProfile.organizationId,
        userId: userProfile.id,
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
