// GET /api/mobile/active-job — Get the mechanic's current active job
//
// Returns the single job that the mechanic should capture for.
// The iOS glasses app polls this on launch/foreground and auto-connects.
// A job is "active" when someone clicks "Start Job" on the web dashboard.
//
// Returns null if no active job exists — the iOS app shows
// "No active job" instead of allowing capture.

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
    // Find the mechanic's active job — should be at most one
    // "active" = ready for glasses, "capturing" = glasses already recording
    // "inspecting" = guided inspection started from Jobs page
    const activeJob = await prisma.captureSession.findFirst({
      where: {
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
        status: { in: ["active", "capturing", "inspecting"] },
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        description: true,
        workOrderRef: true,
        targetFormType: true,
        status: true,
        sessionType: true,
        componentId: true,
        startedAt: true,
        _count: {
          select: { evidence: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        activeJob: activeJob
          ? {
              id: activeJob.id,
              description: activeJob.description,
              workOrderRef: activeJob.workOrderRef,
              targetFormType: activeJob.targetFormType,
              status: activeJob.status,
              sessionType: activeJob.sessionType,
              componentId: activeJob.componentId,
              startedAt: activeJob.startedAt,
              evidenceCount: activeJob._count.evidence,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get active job error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load active job" },
      { status: 500 }
    );
  }
}
