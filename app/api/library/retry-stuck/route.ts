// GET  /api/library/retry-stuck — Cron job: automatically retry stuck extractions
// POST /api/library/retry-stuck — Manual admin trigger (same logic)
//
// Finds templates stuck in extraction states, clears expired leases,
// and fires off extraction triggers. This is the safety net that ensures
// broken self-call chains get restarted automatically.

import { prisma } from "@/lib/db";
import { NextResponse, after } from "next/server";

// Allow Vercel cron to invoke this (cron has a 60s default timeout)
export const maxDuration = 60;

// Vercel cron calls GET with Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return retryStuckTemplates();
}

// Manual trigger via POST with internal secret
export async function POST(request: Request) {
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return retryStuckTemplates();
}

async function retryStuckTemplates() {
  // Find all templates stuck in a processing state
  const stuck = await prisma.inspectionTemplate.findMany({
    where: {
      status: { in: ["pending_extraction", "extracting_index", "extracting_details"] },
    },
    select: { id: true, title: true, status: true, updatedAt: true },
  });

  if (stuck.length === 0) {
    return NextResponse.json({ message: "No stuck templates found" });
  }

  // Clear expired leases so the extract endpoint can acquire them
  await prisma.inspectionTemplate.updateMany({
    where: {
      id: { in: stuck.map((t) => t.id) },
    },
    data: {
      extractionRunnerToken: null,
      extractionLeaseExpiresAt: null,
    },
  });

  // Trigger extraction for each stuck template — use stable production URL.
  // Fire-and-forget via after() so this endpoint responds quickly instead of
  // waiting for the full extraction (which would timeout the cron).
  const baseUrl =
    process.env.EXTRACTION_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const secret = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  const templateIds = stuck.map((t) => t.id);

  after(async () => {
    for (const id of templateIds) {
      try {
        await fetch(`${baseUrl}${basePath}/api/library/${id}/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": secret,
          },
          signal: AbortSignal.timeout(10_000), // Don't wait forever
        });
      } catch (err) {
        console.error(`[retry-stuck] Failed to trigger extraction for ${id}:`, err);
      }
    }
  });

  console.log(
    `[retry-stuck] Re-triggered ${stuck.length} templates: ${stuck.map((t) => `${t.title} (${t.status})`).join(", ")}`
  );

  return NextResponse.json({
    retriggered: stuck.length,
    templates: stuck.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  });
}
