// POST /api/mobile/pair — Claim a job via pairing code
//
// Called by the iOS Glass app after scanning a QR code or typing a code.
// Looks up the session by pairing code, validates expiry and org, clears
// the code (single-use), and returns the job details.

import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, error: "Pairing code is required" },
        { status: 400 }
      );
    }

    // Normalize: uppercase, trim whitespace
    const normalizedCode = code.trim().toUpperCase();

    // Look up session by pairing code
    const session = await prisma.captureSession.findUnique({
      where: { pairingCode: normalizedCode },
      select: {
        id: true,
        description: true,
        workOrderRef: true,
        targetFormType: true,
        status: true,
        sessionType: true,
        componentId: true,
        startedAt: true,
        organizationId: true,
        pairingCodeExpiresAt: true,
        _count: { select: { evidence: true } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Invalid pairing code. Check the code and try again." },
        { status: 404 }
      );
    }

    // Check expiry
    if (session.pairingCodeExpiresAt && session.pairingCodeExpiresAt < new Date()) {
      // Clear the expired code
      await prisma.captureSession.update({
        where: { id: session.id },
        data: { pairingCode: null, pairingCodeExpiresAt: null },
      });
      return NextResponse.json(
        { success: false, error: "Pairing code expired. Ask the supervisor to generate a new one." },
        { status: 410 }
      );
    }

    // Validate same organization
    if (auth.user.organizationId && session.organizationId !== auth.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "This job belongs to a different organization." },
        { status: 403 }
      );
    }

    // Claim the job: clear the code (single-use) so it can't be reused
    await prisma.captureSession.update({
      where: { id: session.id },
      data: {
        pairingCode: null,
        pairingCodeExpiresAt: null,
      },
    });

    // Return job details in the same shape as the active-job endpoint
    return NextResponse.json({
      success: true,
      data: {
        activeJob: {
          id: session.id,
          description: session.description,
          workOrderRef: session.workOrderRef,
          targetFormType: session.targetFormType,
          status: session.status,
          sessionType: session.sessionType,
          componentId: session.componentId,
          startedAt: session.startedAt,
          evidenceCount: session._count.evidence,
        },
      },
    });
  } catch (error) {
    console.error("[mobile/pair POST]", error);
    return NextResponse.json(
      { success: false, error: "Failed to pair with job" },
      { status: 500 }
    );
  }
}
