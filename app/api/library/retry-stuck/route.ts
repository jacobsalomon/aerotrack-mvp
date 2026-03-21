// POST /api/library/retry-stuck
// One-off admin endpoint: finds templates stuck in extraction and re-triggers them.
// Protected by the same internal secret as the extract endpoint.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Trigger extraction for each stuck template
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const secret = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  const results = [];
  for (const t of stuck) {
    try {
      const res = await fetch(`${baseUrl}${basePath}/api/library/${t.id}/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
      });
      const data = await res.json();
      results.push({ id: t.id, title: t.title, status: res.status, response: data });
    } catch (err) {
      results.push({ id: t.id, title: t.title, error: String(err) });
    }
  }

  return NextResponse.json({ retriggered: stuck.length, results });
}
