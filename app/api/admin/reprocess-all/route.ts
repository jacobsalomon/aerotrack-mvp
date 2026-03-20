// POST /api/admin/reprocess-all — Re-run measurement extraction on ALL sessions
// that have audio evidence. Calls the per-session reprocess endpoint sequentially.
// Admin-only endpoint for batch reprocessing after model/prompt upgrades.

import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Allow up to 5 minutes for batch reprocessing (Vercel pro plan max = 300s)
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.error;

    // Only allow admin users
    if (authResult.user.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const retranscribe = body.retranscribe ?? false;

    // Find all sessions that have audio evidence
    const sessions = await prisma.captureSession.findMany({
      where: {
        evidence: {
          some: { type: "AUDIO_CHUNK" },
        },
      },
      select: {
        id: true,
        description: true,
        status: true,
        _count: { select: { evidence: { where: { type: "AUDIO_CHUNK" } } } },
      },
      orderBy: { startedAt: "desc" },
    });

    console.log(
      `[ReprocessAll] Found ${sessions.length} sessions with audio evidence`
    );

    const results: Array<{
      sessionId: string;
      description: string | null;
      audioChunks: number;
      success: boolean;
      measurementsExtracted?: number;
      error?: string;
    }> = [];

    // Process each session sequentially to avoid overloading the AI APIs
    for (const session of sessions) {
      console.log(
        `[ReprocessAll] Processing session ${session.id} (${session._count.evidence} chunks)...`
      );

      try {
        // Call the per-session reprocess endpoint internally
        const baseUrl =
          process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000";
        const url = `${baseUrl}/aerovision/api/sessions/${session.id}/reprocess`;

        // Forward the auth cookie/token from the original request
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const authHeader = request.headers.get("authorization");
        const cookieHeader = request.headers.get("cookie");
        if (authHeader) headers["authorization"] = authHeader;
        if (cookieHeader) headers["cookie"] = cookieHeader;

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ retranscribe }),
        });

        const data = await response.json();

        results.push({
          sessionId: session.id,
          description: session.description,
          audioChunks: session._count.evidence,
          success: data.success ?? false,
          measurementsExtracted: data.data?.measurementsExtracted,
          error: data.error,
        });
      } catch (error) {
        results.push({
          sessionId: session.id,
          description: session.description,
          audioChunks: session._count.evidence,
          success: false,
          error:
            error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalMeasurements = results.reduce(
      (sum, r) => sum + (r.measurementsExtracted ?? 0),
      0
    );
    const successCount = results.filter((r) => r.success).length;

    console.log(
      `[ReprocessAll] Complete: ${successCount}/${sessions.length} sessions, ${totalMeasurements} total measurements`
    );

    return NextResponse.json({
      success: true,
      data: {
        sessionsProcessed: sessions.length,
        sessionsSucceeded: successCount,
        sessionsFailed: sessions.length - successCount,
        totalMeasurementsExtracted: totalMeasurements,
        retranscribe,
        results,
      },
    });
  } catch (error) {
    console.error("[ReprocessAll] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Batch reprocessing failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
