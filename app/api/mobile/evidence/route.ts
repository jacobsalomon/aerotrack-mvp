// POST /api/mobile/evidence — Upload a piece of evidence (photo, video, audio chunk)
// For PoC: stores files locally in /public/evidence/ instead of cloud storage
// Protected by API key authentication

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Max file size: 50MB (photos ~5MB, videos ~20MB, audio chunks ~5MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sessionId = formData.get("sessionId") as string | null;
    const type = formData.get("type") as string | null; // PHOTO, VIDEO, AUDIO_CHUNK
    const capturedAt = formData.get("capturedAt") as string | null;
    const gpsLatitude = formData.get("gpsLatitude") as string | null;
    const gpsLongitude = formData.get("gpsLongitude") as string | null;

    if (!file || !sessionId || !type) {
      return NextResponse.json(
        { success: false, error: "file, sessionId, and type are required" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File exceeds 50MB limit" },
        { status: 413 }
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

    // Read file bytes and compute SHA-256 hash for audit integrity
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(bytes).digest("hex");

    // Store locally for PoC — in production this would go to R2
    const evidenceDir = path.join(process.cwd(), "public", "evidence", sessionId);
    await mkdir(evidenceDir, { recursive: true });

    const ext = file.name.split(".").pop() || "bin";
    const fileName = `${type.toLowerCase()}_${Date.now()}.${ext}`;
    const filePath = path.join(evidenceDir, fileName);
    await writeFile(filePath, bytes);

    // URL path for accessing the file via Next.js static serving
    const fileUrl = `/evidence/${sessionId}/${fileName}`;

    // Save to database
    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId,
        type,
        fileUrl,
        fileSize: file.size,
        fileHash,
        mimeType: file.type || "application/octet-stream",
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        gpsLatitude: gpsLatitude ? parseFloat(gpsLatitude) : null,
        gpsLongitude: gpsLongitude ? parseFloat(gpsLongitude) : null,
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
        metadata: JSON.stringify({ type, sessionId, fileSize: file.size }),
      },
    });

    return NextResponse.json({ success: true, data: evidence }, { status: 201 });
  } catch (error) {
    console.error("Evidence upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload evidence" },
      { status: 500 }
    );
  }
}
