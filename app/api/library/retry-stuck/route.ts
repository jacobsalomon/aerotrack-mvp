// GET /api/library/retry-stuck — Cron-driven extraction runner
//
// Runs every 1 minute via Vercel cron. Finds templates needing extraction
// and processes them DIRECTLY — no HTTP calls, no fetch, no URLs, no auth
// headers. Just imports the extraction logic and calls it.
//
// Each invocation processes one step per template. The cron fires again
// next minute for the next step. Progress is saved to DB after each step
// so nothing is lost if the function times out.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { processOneStep } from "@/lib/extraction-runner";

// 300s — same as the extract endpoint. This function IS the extraction
// runner now, so it needs the full timeout budget.
export const maxDuration = 300;

// Vercel cron calls GET with Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExtractionCycle();
}

// Manual trigger via POST (for retry button in UI)
export async function POST(request: Request) {
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExtractionCycle();
}

async function runExtractionCycle() {
  // Find templates that need extraction and don't have an active lease
  const templates = await prisma.inspectionTemplate.findMany({
    where: {
      status: { in: ["pending_extraction", "extracting_index", "extracting_details"] },
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: new Date() } },
      ],
    },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: "asc" }, // Oldest first — fair scheduling
    take: 1, // Process ONE template per cron — keep it simple and reliable
  });

  if (templates.length === 0) {
    return NextResponse.json({ message: "No work to do" });
  }

  const t = templates[0];
  console.log(`[cron] Processing: ${t.title} (${t.status})`);

  // Call extraction logic DIRECTLY — no HTTP, no network
  const result = await processOneStep(t.id);

  console.log(`[cron] Result: ${t.title} → ${result.status}${result.detail ? ` (${result.detail})` : ""}`);

  return NextResponse.json(result);
}
