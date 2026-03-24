// POST /api/library/[templateId]/extract
// Thin HTTP wrapper for manual triggers (retry button, admin tools).
// Primary invocation is via the cron which calls processTemplate directly.

import { NextResponse } from "next/server";
import { processTemplate } from "@/lib/extraction-runner";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const authHeader = _request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId } = await params;
  const result = await processTemplate(templateId);
  return NextResponse.json(result);
}
