// GET /api/mobile/sessions/[id] — Get session details with evidence and documents
// PATCH /api/mobile/sessions/[id] — Update session (status, description, componentId)
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

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
      evidence: { orderBy: { capturedAt: "asc" } },
      documents: { orderBy: { generatedAt: "desc" } },
    },
  });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Session not found" },
      { status: 404 }
    );
  }

  // Only the owning technician or supervisors can view
  if (
    session.technicianId !== auth.technician.id &&
    auth.technician.role === "TECHNICIAN"
  ) {
    return NextResponse.json(
      { success: false, error: "Not authorized to view this session" },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, data: session });
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
    const { status, description, componentId } = body;

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    if (componentId !== undefined) updateData.componentId = componentId;

    // If moving to "processing" or beyond, set completedAt
    if (status && status !== "capturing" && !session.completedAt) {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.captureSession.update({
      where: { id },
      data: updateData,
    });

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

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update session error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update session" },
      { status: 500 }
    );
  }
}
