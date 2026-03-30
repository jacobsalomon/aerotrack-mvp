// Pairing code management for the iOS Glass app.
//
// POST: Generate a 6-character pairing code (shown as QR + text on web).
// GET:  Lightweight poll — checks if the code was claimed by the iOS app.

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
  return Array.from({ length: CODE_LENGTH }, () =>
    CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]
  ).join("");
}

// ─── POST: Generate pairing code ────────────────────────────────────────

export async function POST(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: sessionId } = await params;

  try {
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true },
    });

    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    // Generate a unique code — retry on collision (extremely rare with 30^6 = 729M combinations)
    let code: string | null = null;
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode();
      const existing = await prisma.captureSession.findUnique({
        where: { pairingCode: candidate },
        select: { id: true },
      });
      if (!existing) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Could not generate unique code. Try again." },
        { status: 503 }
      );
    }

    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { pairingCode: code, pairingCodeExpiresAt: expiresAt },
    });

    return NextResponse.json({
      success: true,
      data: { code, expiresAt: expiresAt.toISOString(), sessionId },
    });
  } catch (error) {
    console.error("[pairing-code POST]", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate pairing code" },
      { status: 500 }
    );
  }
}

// ─── GET: Check if code was claimed (lightweight poll) ──────────────────

export async function GET(request: Request, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: sessionId } = await params;

  try {
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: { pairingCode: true, pairingCodeExpiresAt: true },
    });

    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    // Code is null = it was claimed (or never generated)
    const claimed = !session.pairingCode && !!session.pairingCodeExpiresAt;

    return NextResponse.json({
      success: true,
      data: { claimed },
    });
  } catch (error) {
    console.error("[pairing-code GET]", error);
    return NextResponse.json(
      { success: false, error: "Failed to check pairing status" },
      { status: 500 }
    );
  }
}
