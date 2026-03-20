// GET /api/sessions/[id]/audit — Audit trail for a capture session
// Returns AuditLogEntry records related to this session

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: sessionId } = await params;

  // Verify session exists
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Find audit entries where entityId matches the session,
  // or metadata JSON contains the session ID
  const entries = await prisma.auditLogEntry.findMany({
    where: {
      OR: [
        { entityId: sessionId },
        { metadata: { string_contains: sessionId }, entityId: { not: sessionId } },
      ],
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json(entries);
}
