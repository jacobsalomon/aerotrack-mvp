// GET /api/library/retry-stuck — Cron-driven extraction runner
//
// Runs every 1 minute via Vercel cron. Each invocation either:
//   1. Runs a Pass 1 batch (template-level, sequential)
//   2. Claims and processes one section (section-level, parallel)
//
// Multiple cron ticks run concurrently — each claims a different
// section via fenced leasing. No conflicts, no duplicate work.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { processPass1, processSection } from "@/lib/extraction-runner";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExtractionCycle();
}

export async function POST(request: Request) {
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExtractionCycle();
}

async function runExtractionCycle() {
  // Find a template that needs work (one at a time — highest priority first)
  const template = await prisma.inspectionTemplate.findFirst({
    where: {
      status: { in: ["pending_extraction", "extracting_index", "extracting_details"] },
    },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: "asc" },
  });

  if (!template) {
    return NextResponse.json({ message: "No work to do" });
  }

  // Pass 1: template-level lease — only one worker at a time
  if (template.status === "pending_extraction" || template.status === "extracting_index") {
    console.log(`[cron] Pass 1: ${template.title} (${template.status})`);
    const result = await processPass1(template.id);
    console.log(`[cron] Pass 1 done: ${template.title} → ${result.lastStatus} (${result.stepsCompleted} steps, ${(result.elapsedMs / 1000).toFixed(0)}s)`);
    return NextResponse.json(result);
  }

  // Pass 2: section-level lease — multiple workers can run in parallel
  console.log(`[cron] Pass 2: claiming section for ${template.title}`);
  const result = await processSection(template.id);
  console.log(`[cron] Pass 2 done: ${template.title} → ${result.lastStatus} (${result.stepsCompleted} pages, ${(result.elapsedMs / 1000).toFixed(0)}s)`);
  return NextResponse.json(result);
}
