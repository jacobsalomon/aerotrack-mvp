// GET /api/sessions/[id] — Full session detail for the web dashboard
// PATCH /api/sessions/[id] — Update session fields (expectedSteps, description)
// Returns session with all relations: technician, organization, evidence
// (with video annotations), documents (with reviewer), and analysis

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { decorateSessionWithProgress } from "@/lib/session-progress";
import { scheduleSessionProcessingIfNeeded } from "@/lib/session-processing-jobs";
import { buildSessionApiErrorResponse } from "@/lib/session-api-error";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    const session = await prisma.captureSession.findUnique({
      where: { id },
      include: {
        technician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            badgeNumber: true,
            email: true,
            role: true,
          },
        },
        organization: {
          select: { id: true, name: true },
        },
        evidence: {
          include: {
            videoAnnotations: {
              orderBy: { timestamp: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        documents: {
          include: {
            reviewedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { generatedAt: "asc" },
        },
        analysis: true,
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
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await scheduleSessionProcessingIfNeeded(session);

    return NextResponse.json(decorateSessionWithProgress(session));
  } catch (error) {
    console.error("Get session detail error:", error);
    return buildSessionApiErrorResponse(error, "detail");
  }
}

// Update session fields from the web dashboard (e.g. expectedSteps)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id } = await params;

  const session = await prisma.captureSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { expectedSteps, description } = body;

    const updateData: Record<string, unknown> = {};
    if (expectedSteps !== undefined) updateData.expectedSteps = expectedSteps;
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.captureSession.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update session error:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
