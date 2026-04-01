import { prisma } from "@/lib/db";
import {
  isMentraSessionWritable,
  requireMentraBridge,
} from "@/lib/mentra-bridge";
import {
  ensureSessionProcessingJob,
  scheduleSessionProcessing,
} from "@/lib/session-processing-jobs";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const bridgeAuth = await requireMentraBridge(request);
  if ("error" in bridgeAuth) return bridgeAuth.error;

  try {
    const body = await request.json();
    const action = String(body.action || "").trim();
    const { id } = await params;

    if (action !== "start" && action !== "stop") {
      return NextResponse.json(
        { success: false, error: "action must be 'start' or 'stop'" },
        { status: 400 }
      );
    }

    const session = await prisma.captureSession.findUnique({
      where: { id },
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
        { success: false, error: "This session is not accepting Mentra capture" },
        { status: 409 }
      );
    }

    if (action === "start") {
      if (session.sessionType === "inspection" && session.status !== "inspecting") {
        return NextResponse.json(
          { success: false, error: "Inspection session is not actively inspecting" },
          { status: 409 }
        );
      }

      if (
        session.sessionType === "capture" &&
        !["active", "paused", "capturing"].includes(session.status)
      ) {
        return NextResponse.json(
          { success: false, error: `Session status '${session.status}' cannot start Mentra capture` },
          { status: 409 }
        );
      }

      if (session.sessionType === "capture" && session.status === "paused") {
        await prisma.captureSession.update({
          where: { id },
          data: {
            status: "active",
            completedAt: null,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          sessionId: id,
          sessionType: session.sessionType,
          status: session.sessionType === "capture" && session.status === "paused"
            ? "active"
            : session.status,
        },
      });
    }

    if (session.sessionType === "capture" && session.status !== "capture_complete") {
      await prisma.captureSession.update({
        where: { id },
        data: {
          status: "capture_complete",
          completedAt: new Date(),
        },
      });

      const processingJob = await ensureSessionProcessingJob(id);
      if (processingJob) {
        scheduleSessionProcessing(processingJob.id);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: id,
        sessionType: session.sessionType,
        status: session.sessionType === "capture" ? "capture_complete" : session.status,
      },
    });
  } catch (error) {
    console.error("[mentra bridge capture route]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update Mentra capture state" },
      { status: 500 }
    );
  }
}
