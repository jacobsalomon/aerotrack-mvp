// GET /api/library/retry-stuck — Cron-driven extraction runner
//
// Runs every 1 minute via Vercel cron. Finds ONE template needing extraction
// and processes as many steps as possible within the 300s timeout.
// Downloads the PDF once and reuses it across all steps.
// No HTTP calls to other endpoints — imports extraction logic directly.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { processTemplate } from "@/lib/extraction-runner";

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
  const template = await prisma.inspectionTemplate.findFirst({
    where: {
      status: { in: ["pending_extraction", "extracting_index", "extracting_details"] },
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: new Date() } },
      ],
    },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: "asc" },
  });

  if (!template) {
    return NextResponse.json({ message: "No work to do" });
  }

  console.log(`[cron] Starting: ${template.title} (${template.status})`);
  const result = await processTemplate(template.id);
  console.log(`[cron] Done: ${template.title} → ${result.lastStatus} (${result.stepsCompleted} steps, ${(result.elapsedMs / 1000).toFixed(0)}s)`);

  return NextResponse.json(result);
}
