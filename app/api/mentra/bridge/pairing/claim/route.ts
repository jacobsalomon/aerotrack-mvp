import { prisma } from "@/lib/db";
import {
  buildMentraSessionLabel,
  isMentraSessionConnectable,
  requireMentraBridge,
} from "@/lib/mentra-bridge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const bridgeAuth = await requireMentraBridge(request);
  if ("error" in bridgeAuth) return bridgeAuth.error;

  try {
    const body = await request.json();
    const code = String(body.code || "")
      .trim()
      .toUpperCase();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "code is required" },
        { status: 400 }
      );
    }

    const session = await prisma.captureSession.findUnique({
      where: { pairingCode: code },
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
        { success: false, error: "Invalid or expired code" },
        { status: 404 }
      );
    }

    if (
      session.pairingCodeExpiresAt &&
      session.pairingCodeExpiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { success: false, error: "Code expired. Generate a new code from AeroVision." },
        { status: 410 }
      );
    }

    if (!isMentraSessionConnectable(session)) {
      return NextResponse.json(
        { success: false, error: "This session is not available for Mentra pairing" },
        { status: 409 }
      );
    }

    const claimResult = await prisma.captureSession.updateMany({
      where: {
        id: session.id,
        pairingCode: code,
      },
      data: {
        pairingCode: null,
      },
    });

    if (claimResult.count !== 1) {
      return NextResponse.json(
        { success: false, error: "This code was already claimed. Generate a new code." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        sessionType: session.sessionType,
        sessionLabel: buildMentraSessionLabel(session),
      },
    });
  } catch (error) {
    console.error("[mentra bridge pairing claim]", error);
    return NextResponse.json(
      { success: false, error: "Failed to claim pairing code" },
      { status: 500 }
    );
  }
}
