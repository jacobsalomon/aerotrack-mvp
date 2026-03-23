// GET /api/library/retry-stuck — Cron-driven extraction runner
//
// Runs every 1 minute via Vercel cron. Finds templates that need extraction
// and fires off requests to the extract endpoint. Does NOT wait for extraction
// to finish — each extract call runs in its own serverless invocation with a
// 300s timeout. This cron just kicks them off and returns.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

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
  const templates = await prisma.inspectionTemplate.findMany({
    where: {
      status: { in: ["pending_extraction", "extracting_index", "extracting_details"] },
      OR: [
        { extractionRunnerToken: null },
        { extractionLeaseExpiresAt: { lt: new Date() } },
      ],
    },
    select: { id: true, title: true, status: true },
    take: 3,
  });

  if (templates.length === 0) {
    return NextResponse.json({ message: "No work to do" });
  }

  const baseUrl =
    process.env.EXTRACTION_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const secret = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  // Fire extraction requests WITHOUT awaiting the response.
  // Each fetch spawns a separate serverless invocation on Vercel with its
  // own 300s timeout. We don't need to wait — just confirm the request was
  // accepted (the TCP connection was established). A short 5s timeout is
  // enough to verify the endpoint received the request.
  const triggered = [];
  for (const t of templates) {
    const url = `${baseUrl}${basePath}/api/library/${t.id}/extract`;
    console.log(`[cron] Calling: ${url}`);
    try {
      // Use a short timeout — we just need to confirm the server accepted
      // the connection, not wait for extraction to complete
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
        signal: AbortSignal.timeout(5_000),
      });
      // If we got a response in 5s, great — log it
      triggered.push({ id: t.id, title: t.title, status: res.status });
      console.log(`[cron] Triggered ${t.title}: ${res.status}`);
    } catch (err) {
      // Timeout after 5s is EXPECTED — it means the extract endpoint is
      // running (it takes 30-120s). The request was accepted.
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg.includes("abort") || msg.includes("timeout")) {
        triggered.push({ id: t.id, title: t.title, status: "accepted" });
        console.log(`[cron] Triggered ${t.title}: running (timed out waiting for response, which is expected)`);
      } else {
        triggered.push({ id: t.id, title: t.title, status: "error", error: msg });
        console.error(`[cron] Failed to trigger ${t.title}: ${msg}`);
      }
    }
  }

  return NextResponse.json({ triggered: triggered.length, results: triggered });
}
