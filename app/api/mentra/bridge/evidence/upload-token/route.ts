import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { prisma } from "@/lib/db";
import {
  isMentraSessionWritable,
  requireMentraBridge,
} from "@/lib/mentra-bridge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const bridgeAuth = await requireMentraBridge(request);
  if ("error" in bridgeAuth) return bridgeAuth.error;

  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || "").trim();
    const pathname = String(body.pathname || "").trim();
    const contentType =
      typeof body.contentType === "string" && body.contentType.trim()
        ? body.contentType.trim()
        : null;

    if (!sessionId || !pathname) {
      return NextResponse.json(
        { success: false, error: "sessionId and pathname are required" },
        { status: 400 }
      );
    }

    if (!pathname.startsWith(`evidence/${sessionId}/`)) {
      return NextResponse.json(
        { success: false, error: "pathname must stay within the session evidence prefix" },
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

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Blob storage not configured" },
        { status: 500 }
      );
    }

    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      allowedContentTypes: contentType
        ? [contentType]
        : [
            "image/jpeg",
            "image/png",
            "image/heic",
            "video/mp4",
            "video/quicktime",
            "audio/wav",
            "audio/x-wav",
            "audio/m4a",
            "audio/mp4",
            "audio/mpeg",
            "audio/x-m4a",
            "audio/webm",
          ],
      maximumSizeInBytes: 50 * 1024 * 1024,
    });

    return NextResponse.json({
      success: true,
      data: {
        clientToken,
        uploadUrl: "https://blob.vercel-storage.com",
      },
    });
  } catch (error) {
    console.error("[mentra bridge upload token]", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate upload token" },
      { status: 500 }
    );
  }
}
