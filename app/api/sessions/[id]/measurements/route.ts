// GET /api/sessions/[id]/measurements — List measurements for a capture session
// Supports incremental polling via ?since= parameter

import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;

  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    const where: Record<string, unknown> = { captureSessionId: sessionId };
    if (since) {
      where.updatedAt = { gte: new Date(since) };
    }

    const measurements = await prisma.measurement.findMany({
      where,
      include: {
        sources: {
          select: {
            sourceType: true,
            value: true,
            unit: true,
            confidence: true,
            rawExcerpt: true,
          },
        },
      },
      orderBy: { sequenceInShift: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: measurements,
      polledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("List session measurements error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list measurements" },
      { status: 500 }
    );
  }
}
