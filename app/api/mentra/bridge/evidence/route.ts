import { prisma } from "@/lib/db";
import {
  getAllowedEvidenceHostsForError,
  isAllowedEvidenceUrl,
} from "@/lib/evidence-url";
import {
  isMentraSessionWritable,
  requireMentraBridge,
} from "@/lib/mentra-bridge";
import { NextResponse } from "next/server";

const VALID_TYPES = new Set(["PHOTO", "VIDEO", "AUDIO_CHUNK"]);

export async function POST(request: Request) {
  const bridgeAuth = await requireMentraBridge(request);
  if ("error" in bridgeAuth) return bridgeAuth.error;

  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || "").trim();
    const type = String(body.type || "")
      .trim()
      .toUpperCase();
    const blobUrl = String(body.blobUrl || "").trim();
    const mimeType = String(body.mimeType || "application/octet-stream").trim();
    const transcription =
      typeof body.transcription === "string" && body.transcription.trim()
        ? body.transcription.trim()
        : null;

    if (!sessionId || !type || !blobUrl) {
      return NextResponse.json(
        { success: false, error: "sessionId, type, and blobUrl are required" },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid evidence type" },
        { status: 400 }
      );
    }

    if (!isAllowedEvidenceUrl(blobUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: `blobUrl must be an HTTPS URL from an allowed host (${getAllowedEvidenceHostsForError()})`,
        },
        { status: 400 }
      );
    }

    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        sessionType: true,
        status: true,
        description: true,
        workOrderRef: true,
        signedOffAt: true,
        pairingCodeExpiresAt: true,
        inspectionTemplate: {
          select: { title: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    if (!isMentraSessionWritable(session)) {
      return NextResponse.json(
        { success: false, error: "This session is not accepting Mentra evidence" },
        { status: 409 }
      );
    }

    const capturedAt =
      typeof body.capturedAt === "string" && !Number.isNaN(Date.parse(body.capturedAt))
        ? new Date(body.capturedAt)
        : new Date();
    const durationSeconds =
      typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
        ? body.durationSeconds
        : null;
    const gpsLatitude =
      typeof body.gpsLatitude === "number" && Number.isFinite(body.gpsLatitude)
        ? body.gpsLatitude
        : null;
    const gpsLongitude =
      typeof body.gpsLongitude === "number" && Number.isFinite(body.gpsLongitude)
        ? body.gpsLongitude
        : null;
    const fileSize =
      typeof body.fileSize === "number" && Number.isFinite(body.fileSize)
        ? Math.max(0, Math.round(body.fileSize))
        : 0;
    const fileHash =
      typeof body.fileHash === "string" && body.fileHash.trim().length > 0
        ? body.fileHash.trim()
        : null;
    const inspectionItemId =
      typeof body.inspectionItemId === "string" && body.inspectionItemId.trim()
        ? body.inspectionItemId.trim()
        : null;
    const instanceIndex =
      typeof body.instanceIndex === "number" && Number.isInteger(body.instanceIndex)
        ? body.instanceIndex
        : null;

    const evidence = await prisma.captureEvidence.create({
      data: {
        sessionId,
        type,
        fileUrl: blobUrl,
        fileSize,
        fileHash,
        mimeType,
        capturedAt,
        durationSeconds,
        transcription,
        gpsLatitude,
        gpsLongitude,
        inspectionItemId,
        instanceIndex,
      },
    });

    await prisma.auditLogEntry.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "mentra_bridge_evidence_captured",
        entityType: "CaptureEvidence",
        entityId: evidence.id,
        metadata: {
          sessionId,
          type,
          mimeType,
          fileSize,
          durationSeconds,
          bridgeSource: body.source || "mentra_live",
          chunkIndex:
            typeof body.chunkIndex === "number" && Number.isInteger(body.chunkIndex)
              ? body.chunkIndex
              : null,
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: evidence,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[mentra bridge evidence]", error);
    return NextResponse.json(
      { success: false, error: "Failed to register Mentra evidence" },
      { status: 500 }
    );
  }
}
