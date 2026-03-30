// POST /api/sessions/[id]/pairing-code — Generate a pairing code for the iOS Glass app
//
// Called by the web dashboard when a supervisor clicks "Send to Glasses".
// Returns a 6-character alphanumeric code (also shown as a QR deep link).
// Code expires after 5 minutes and is single-use (cleared when claimed).

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { NextResponse } from "next/server";
import crypto from "crypto";

type RouteContext = { params: Promise<{ id: string }> };

// Characters that are easy to read and type — no O/0/I/1/L ambiguity
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 5;

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => CODE_CHARS[b % CODE_CHARS.length])
    .join("");
}

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: sessionId } = await params;

  try {
    // Verify the session exists and belongs to the user's organization
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true, status: true },
    });

    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    // Generate a unique code (retry if collision, extremely unlikely with 6-char space)
    let code = generateCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.captureSession.findUnique({
        where: { pairingCode: code },
        select: { id: true },
      });
      if (!existing) break;
      code = generateCode();
      attempts++;
    }

    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

    // Store the code on the session (replaces any previous code)
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: {
        pairingCode: code,
        pairingCodeExpiresAt: expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        code,
        expiresAt: expiresAt.toISOString(),
        sessionId,
      },
    });
  } catch (error) {
    console.error("[pairing-code POST]", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate pairing code" },
      { status: 500 }
    );
  }
}
