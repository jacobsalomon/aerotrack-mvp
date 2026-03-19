// POST /api/mobile/verify-documents — Independent AI verification of generated documents
// Cross-checks generated forms against raw evidence and known discrepancies
// Protected by API key authentication

// Allow up to 120 seconds for model fallback plus DB persistence
export const maxDuration = 120;

import { authenticateRequest } from "@/lib/mobile-auth";
import { verifyDocuments } from "@/lib/ai/verify";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  let sessionId: string;
  try {
    const body = await request.json();
    sessionId = body.sessionId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId is required" },
      { status: 400 }
    );
  }

  try {
    const session = await prisma.captureSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    const isSameOrganization =
      session.organizationId === auth.user.organizationId;
    const isOwner = session.userId === auth.user.id;
    const isPrivileged =
      auth.user.role === "SUPERVISOR" || auth.user.role === "ADMIN";

    if (!isSameOrganization || (!isOwner && !isPrivileged)) {
      return NextResponse.json(
        { success: false, error: "Not authorized for this session" },
        { status: 403 }
      );
    }

    // Delegate to shared verification logic
    const result = await verifyDocuments(sessionId, auth.user.id);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Verify documents error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Document verification failed",
      },
      { status: 500 }
    );
  }
}
