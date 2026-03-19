// GET /api/mobile/sessions/[id] — Get session details with evidence and documents
// PATCH /api/mobile/sessions/[id] — Update session (status, description, componentId, expectedSteps)
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import {
  MOBILE_SESSION_MUTABLE_STATUS_VALUES,
  isMobileMutableSessionStatus,
} from "@/lib/session-status";
import { decorateSessionWithProgress } from "@/lib/session-progress";
import {
  ensureSessionProcessingJob,
  scheduleSessionProcessing,
  scheduleSessionProcessingIfNeeded,
} from "@/lib/session-processing-jobs";
import { NextResponse } from "next/server";

const PRIVILEGED_ROLES = new Set(["SUPERVISOR", "ADMIN"]);

// Get full session details including all evidence and generated documents
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const session = await prisma.captureSession.findUnique({
    where: { id },
    include: {
      evidence: {
        orderBy: { capturedAt: "asc" },
        include: { videoAnnotations: { orderBy: { timestamp: "asc" } } },
      },
      documents: { orderBy: { generatedAt: "desc" } },
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
    return NextResponse.json(
      { success: false, error: "Session not found" },
      { status: 404 }
    );
  }

  const isSameOrganization =
    session.organizationId === auth.technician.organizationId;
  const isOwner = session.technicianId === auth.technician.id;
  const isPrivileged = PRIVILEGED_ROLES.has(auth.technician.role);

  if (!isSameOrganization || (!isOwner && !isPrivileged)) {
    return NextResponse.json(
      { success: false, error: "Not authorized to view this session" },
      { status: 403 }
    );
  }

  await scheduleSessionProcessingIfNeeded(session);

  return NextResponse.json({
    success: true,
    data: decorateSessionWithProgress(session),
  });
}

// Update session — typically to end capture or link a component
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const session = await prisma.captureSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Session not found" },
      { status: 404 }
    );
  }

  if (session.technicianId !== auth.technician.id) {
    return NextResponse.json(
      { success: false, error: "Not authorized to update this session" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { status, description, componentId, expectedSteps, retryProcessing } = body;

    // Validate status against allowed values (must match all statuses used by mobile app + results screen)
    if (status && !isMobileMutableSessionStatus(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status. Must be one of: ${MOBILE_SESSION_MUTABLE_STATUS_VALUES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    if (componentId !== undefined) updateData.componentId = componentId;
    if (expectedSteps !== undefined) updateData.expectedSteps = expectedSteps;

    // If moving to "processing" or beyond, set completedAt
    if (status && status !== "capturing" && !session.completedAt) {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.captureSession.update({
      where: { id },
      data: updateData,
    });

    let processingJob = null;
    if (status === "capture_complete" || retryProcessing === true) {
      processingJob = await ensureSessionProcessingJob(id, {
        forceRetry: retryProcessing === true,
      });
      scheduleSessionProcessing(processingJob.id);
    }

    // Log status changes
    if (status) {
      await prisma.auditLogEntry.create({
        data: {
          organizationId: auth.technician.organizationId,
          technicianId: auth.technician.id,
          action: `session_${status}`,
          entityType: "CaptureSession",
          entityId: id,
          metadata: JSON.stringify({ previousStatus: session.status }),
        },
      });
    }

    const sessionWithProgress = await prisma.captureSession.findUnique({
      where: { id: updated.id },
      include: {
        evidence: {
          orderBy: { capturedAt: "asc" },
          include: { videoAnnotations: { orderBy: { timestamp: "asc" } } },
        },
        documents: { orderBy: { generatedAt: "desc" } },
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

    if (!sessionWithProgress) {
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({
      success: true,
      data: decorateSessionWithProgress(sessionWithProgress),
    });
  } catch (error) {
    console.error("Update session error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update session" },
      { status: 500 }
    );
  }
}
