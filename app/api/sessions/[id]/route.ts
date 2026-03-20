// GET /api/sessions/[id] — Full session detail for the web dashboard
// PATCH /api/sessions/[id] — Update session fields (expectedSteps, description)
// Returns session with all relations: user, organization, evidence
// (with video annotations), documents (with reviewer), and analysis

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { decorateSessionWithProgress } from "@/lib/session-progress";
import {
  ensureSessionProcessingJob,
  scheduleSessionProcessing,
  scheduleSessionProcessingIfNeeded,
} from "@/lib/session-processing-jobs";
import { buildSessionApiErrorResponse } from "@/lib/session-api-error";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;

    const session = await prisma.captureSession.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
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
        orgDocument: {
          select: { id: true, title: true, fileUrl: true, formFieldsJson: true },
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
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id } = await params;

  const session = await prisma.captureSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { expectedSteps, description, status } = body;

    const updateData: Record<string, unknown> = {};
    if (expectedSteps !== undefined) updateData.expectedSteps = expectedSteps;
    if (description !== undefined) updateData.description = description;
    // Allow the web dashboard to end a session (capturing → capture_complete)
    const isEnding = status === "capture_complete" && session.status === "capturing";
    if (isEnding) {
      updateData.status = "capture_complete";
      updateData.completedAt = new Date();
    }

    // Allow retrying a failed processing job
    const isRetry = status === "retry_processing" && session.status === "failed";

    const updated = await prisma.captureSession.update({
      where: { id },
      data: updateData,
    });

    // Trigger processing immediately when session ends — don't wait for the next poll
    if (isEnding) {
      try {
        const job = await ensureSessionProcessingJob(id);
        scheduleSessionProcessing(job.id);
      } catch (err) {
        console.error("Failed to enqueue processing:", err);
      }
    }

    // Retry failed processing
    if (isRetry) {
      try {
        const job = await ensureSessionProcessingJob(id, { forceRetry: true });
        scheduleSessionProcessing(job.id);
      } catch (err) {
        console.error("Failed to retry processing:", err);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update session error:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
