// POST /api/shifts/[id]/video — Upload a video chunk from the glasses
// Sends video to Gemini for visual analysis, extracts gauge/instrument readings,
// cross-references with recent audio measurements, and updates the ledger.
// Protected by API key authentication (mobile/glasses only)

import { authenticateRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { extractMeasurementsFromVideo } from "@/lib/ai/visual-measurement";
import { recordMeasurement } from "@/lib/measurement-ledger";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id: shiftId } = await params;

  try {
    // Verify shift
    const shift = await prisma.shiftSession.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Shift not found" }, { status: 404 });
    }
    if (shift.userId !== auth.user.id) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }
    if (shift.status !== "active") {
      return NextResponse.json({ success: false, error: "Shift is not active" }, { status: 409 });
    }

    const body = await request.json();
    const { videoUrl, chunkTimestamp } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, error: "videoUrl is required (upload video to blob storage first)" },
        { status: 400 }
      );
    }

    // Parse chunk timestamp as a Date (ISO string)
    const chunkStartTime = chunkTimestamp ? new Date(chunkTimestamp).getTime() : Date.now();

    // Step 1: Analyze video with Gemini for visual measurements
    const extracted = await extractMeasurementsFromVideo(videoUrl);

    // Step 2: Record each measurement (with cross-referencing against audio)
    const recorded = [];
    for (const m of extracted) {
      const measurement = await recordMeasurement({
        shiftSessionId: shiftId,
        measurementType: m.measurementType,
        parameterName: m.parameterName,
        value: m.value,
        unit: m.unit,
        source: {
          sourceType: "video_frame",
          confidence: m.confidence,
          rawExcerpt: m.rawExcerpt,
          timestamp: m.timestampInChunk
            ? (chunkStartTime / 1000 + m.timestampInChunk)
            : undefined,
        },
      });
      recorded.push(measurement);
    }

    return NextResponse.json({
      success: true,
      data: {
        measurementsExtracted: extracted.length,
        measurements: recorded,
      },
    });
  } catch (error) {
    console.error("Video processing error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process video chunk" },
      { status: 500 }
    );
  }
}
