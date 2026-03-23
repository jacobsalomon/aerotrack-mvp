// GET /api/library/retry-stuck — Cron-driven extraction runner
//
// This is the ONLY way extraction gets triggered. Runs every 1 minute via
// Vercel cron. Finds templates that need work, calls the extract endpoint
// directly (no after(), no fire-and-forget, no self-calling chains).
//
// The extract endpoint processes ONE step per call and returns.
// This cron picks it back up next minute for the next step.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExtractionCycle();
}

// POST for manual trigger via internal secret
export async function POST(request: Request) {
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExtractionCycle();
}

async function runExtractionCycle() {
  // Find templates that need extraction work
  const templates = await prisma.inspectionTemplate.findMany({
    where: {
      status: { in: ["pending_extraction", "extracting_index", "extracting_details"] },
      // Only pick up templates without an active (non-expired) lease
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: new Date() } },
      ],
    },
    select: { id: true, title: true, status: true },
    take: 3, // Process up to 3 templates per cron cycle
  });

  if (templates.length === 0) {
    return NextResponse.json({ message: "No work to do" });
  }

  // Call the extract endpoint directly for each template.
  // This is a synchronous HTTP call — no after(), no fire-and-forget.
  const baseUrl =
    process.env.EXTRACTION_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const secret = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  const results = [];
  for (const t of templates) {
    try {
      const res = await fetch(`${baseUrl}${basePath}/api/library/${t.id}/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
        signal: AbortSignal.timeout(55_000), // Stay within 60s cron limit
      });
      const data = await res.json();
      results.push({ id: t.id, title: t.title, status: res.status, result: data });
      console.log(`[cron] ${t.title}: ${JSON.stringify(data)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      results.push({ id: t.id, title: t.title, status: "error", error: msg });
      console.error(`[cron] Failed to process ${t.title}:`, msg);
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
