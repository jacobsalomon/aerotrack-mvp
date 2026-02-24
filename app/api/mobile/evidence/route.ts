// POST /api/mobile/evidence — Register evidence from a client-side Vercel Blob upload
// The mobile app uploads files directly to Vercel Blob (bypassing the 4.5MB serverless limit),
// then calls this endpoint with the blob URL + metadata to create the database record.
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { sessionId, type, blobUrl, fileSize, mimeType, capturedAt, gpsLatitude, gpsLongitude } = body;

    if (!sessionId || !type || !blobUrl) {
      return NextResponse.json(
        { success: false, error: "sessionId, type, and blobUrl are required" },
        { status: 400 }
      );
    }

    // Validate blobUrl is an HTTPS URL
    try {
      const parsed = new URL(String(blobUrl));
      if (parsed.protocol !== "https:") {
        return NextResponse.json(
          { success: false, error: "blobUrl must be an HTTPS URL" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "blobUrl must be a valid URL" },
        { status: 400 }
      );
    }

    // Validate capturedAt is a valid date if provided
    if (capturedAt && isNaN(new Date(capturedAt).getTime())) {
      return NextResponse.json(
        { success: false, error: "capturedAt must be a valid date" },
        { status: 400 }
      );
    }

    // Validate evidence type — must be uppercase to match downstream filters
    const validTypes = ["PHOTO", "VIDEO", "AUDIO_CHUNK"];
    const normalizedType = String(type).toUpperCase();
    if (!validTypes.includes(normalizedType)) {
      return NextResponse.json(
        { success: false, error: `Invalid evidence type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify the session exists and belongs to this technician
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.technicianId !== auth.technician.id) {
      return NextResponse.json(
        { success: false, error: "Not authorized for this session" },
        { status: 403 }
      );
    }

    // Save to database
    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId,
        type: normalizedType,
        fileUrl: blobUrl,
        fileSize: fileSize || 0,
        mimeType: mimeType || "application/octet-stream",
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        gpsLatitude: gpsLatitude && !isNaN(parseFloat(gpsLatitude)) ? parseFloat(gpsLatitude) : null,
        gpsLongitude: gpsLongitude && !isNaN(parseFloat(gpsLongitude)) ? parseFloat(gpsLongitude) : null,
      },
    });

    // Log it
    await prisma.auditLogEntry.create({
      data: {
        organizationId: auth.technician.organizationId,
        technicianId: auth.technician.id,
        action: "evidence_captured",
        entityType: "CaptureEvidence",
        entityId: evidence.id,
        metadata: JSON.stringify({ type, sessionId, fileSize: fileSize || 0 }),
      },
    });

    return NextResponse.json({ success: true, data: evidence }, { status: 201 });
  } catch (error) {
    console.error("Evidence registration error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to register evidence" },
      { status: 500 }
    );
  }
}
