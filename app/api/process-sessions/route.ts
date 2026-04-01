// GET /api/process-sessions — Cron-driven session processing runner
//
// Runs every 1 minute via Vercel cron. Each invocation:
//   1. Finds sessions stuck in capture_complete with no processing job → creates one
//   2. Finds processing jobs with expired leases that aren't done → re-triggers them
//
// The lease model in session-processing-jobs.ts prevents duplicate work.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  ensureSessionProcessingJob,
  scheduleSessionProcessing,
} from "@/lib/session-processing-jobs";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return processSessionsCycle();
}

// Also support POST for manual testing with internal secret
export async function POST(request: Request) {
  const INTERNAL_SECRET =
    process.env.INTERNAL_API_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;
  const authHeader = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return processSessionsCycle();
}

async function processSessionsCycle() {
  const now = new Date();
  let jobsRetriggered = 0;
  let sessionsEnqueued = 0;

  try {
    // 1. Find sessions that finished capturing but have no processing job yet.
    //    These are sessions the iOS app marked capture_complete but nobody
    //    loaded the dashboard to trigger processing.
    //    Wait 60 seconds after completion before starting — gives the
    //    auto-analysis (photo OCR, transcription, video annotation) time
    //    to finish for the last uploaded chunks.
    const cooldownCutoff = new Date(now.getTime() - 60_000);
    const orphanedSessions = await prisma.captureSession.findMany({
      where: {
        status: "capture_complete",
        sessionType: { not: "inspection" },
        processingJob: null,
        updatedAt: { lt: cooldownCutoff },
      },
      select: { id: true },
      take: 10,
    });

    for (const session of orphanedSessions) {
      try {
        const job = await ensureSessionProcessingJob(session.id);
        if (job) {
          scheduleSessionProcessing(job.id);
          sessionsEnqueued++;
        }
      } catch (err) {
        console.error(
          `[process-sessions] Failed to enqueue session ${session.id}:`,
          err
        );
      }
    }

    // 2. Find stuck processing jobs — not completed/failed, with expired leases.
    //    These are jobs that started but the runner crashed or timed out.
    const stuckJobs = await prisma.sessionProcessingJob.findMany({
      where: {
        currentStage: { notIn: ["completed", "failed"] },
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      select: { id: true, currentStage: true, sessionId: true },
      take: 10,
    });

    for (const job of stuckJobs) {
      try {
        scheduleSessionProcessing(job.id);
        jobsRetriggered++;
      } catch (err) {
        console.error(
          `[process-sessions] Failed to retrigger job ${job.id}:`,
          err
        );
      }
    }

    return NextResponse.json({
      ok: true,
      sessionsEnqueued,
      jobsRetriggered,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[process-sessions] Cycle error:", error);
    return NextResponse.json(
      { error: "Processing cycle failed" },
      { status: 500 }
    );
  }
}
