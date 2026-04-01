// POST /api/inspect/sessions/[id]/photos
// Upload a photo from the web UI and link it to a session (and optionally an inspection item).
// GET returns all photos for a session, grouped by inspectionItemId.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { put } from "@vercel/blob";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id: sessionId } = await params;

    // Verify session exists, belongs to org, and is not signed off
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true, signedOffAt: true, inspectionTemplateId: true },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.signedOffAt) {
      return NextResponse.json({ success: false, error: "Session is signed off" }, { status: 403 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const inspectionItemId = formData.get("inspectionItemId") as string | null;
    const instanceIndexStr = formData.get("instanceIndex") as string | null;
    const instanceIndex = instanceIndexStr != null ? parseInt(instanceIndexStr, 10) : null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "File must be an image" }, { status: 400 });
    }

    // Max 5MB (client should compress to ~2MB, but allow some headroom)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Validate inspectionItemId belongs to this session's template (prevent cross-session linkage)
    if (inspectionItemId && session.inspectionTemplateId) {
      const itemExists = await prisma.inspectionItem.findFirst({
        where: { id: inspectionItemId, section: { templateId: session.inspectionTemplateId } },
        select: { id: true },
      });
      if (!itemExists) {
        return NextResponse.json({ success: false, error: "Inspection item not found in this session" }, { status: 400 });
      }
    }

    // Upload to Vercel Blob (random suffix prevents collision on concurrent uploads)
    const ext = file.type === "image/png" ? "png" : file.type === "image/heic" ? "heic" : "jpg";
    const suffix = Math.random().toString(36).slice(2, 8);
    const blobPath = `photos/${sessionId}/${Date.now()}-${suffix}.${ext}`;

    const blob = await put(blobPath, file, {
      access: "public",
      contentType: file.type,
    });

    // Create CaptureEvidence record
    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId,
        type: "PHOTO",
        fileUrl: blob.url,
        fileSize: file.size,
        mimeType: file.type,
        capturedAt: new Date(),
        inspectionItemId: inspectionItemId || null,
        instanceIndex: instanceIndex,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: evidence.id,
        fileUrl: evidence.fileUrl,
        inspectionItemId: evidence.inspectionItemId,
        instanceIndex: evidence.instanceIndex,
        capturedAt: evidence.capturedAt,
      },
    });
  } catch (error) {
    console.error("[inspect/sessions/[id]/photos POST]", error);
    return NextResponse.json({ success: false, error: "Failed to upload photo" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id: sessionId } = await params;

    // Verify session ownership
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true },
    });

    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    // Fetch all photos for this session (include item name for display labels)
    const photos = await prisma.captureEvidence.findMany({
      where: { sessionId, type: "PHOTO" },
      select: {
        id: true,
        fileUrl: true,
        inspectionItemId: true,
        instanceIndex: true,
        capturedAt: true,
        inspectionItem: { select: { parameterName: true } },
      },
      orderBy: { capturedAt: "asc" },
    });

    return NextResponse.json({ success: true, data: photos });
  } catch (error) {
    console.error("[inspect/sessions/[id]/photos GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load photos" }, { status: 500 });
  }
}

// PATCH — reassign a photo to a different inspection item
export async function PATCH(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { id: sessionId } = await params;
    const body = await request.json();
    const { evidenceId, inspectionItemId } = body as { evidenceId: string; inspectionItemId: string };

    if (!evidenceId || !inspectionItemId) {
      return NextResponse.json({ success: false, error: "evidenceId and inspectionItemId required" }, { status: 400 });
    }

    // Verify session ownership and not signed off
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true, signedOffAt: true },
    });
    if (!session || session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (session.signedOffAt) {
      return NextResponse.json({ success: false, error: "Session is signed off — cannot modify" }, { status: 403 });
    }

    // Update the evidence record
    await prisma.captureEvidence.update({
      where: { id: evidenceId, sessionId },
      data: { inspectionItemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[inspect/sessions/[id]/photos PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to reassign photo" }, { status: 500 });
  }
}
