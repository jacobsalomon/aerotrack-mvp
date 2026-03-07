// GET /api/sessions — List all capture sessions for the web dashboard
// Includes technician info, evidence counts, and document counts
// Protected by dashboard auth (passcode cookie)

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { decorateSessionWithProgress } from "@/lib/session-progress";
import { scheduleSessionProcessingIfNeeded } from "@/lib/session-processing-jobs";
import { buildSessionApiErrorResponse } from "@/lib/session-api-error";

export async function GET(request: Request) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

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
