// POST /api/library/[templateId]/extract
// Processes one step of extraction for a template.
// Primary invocation is via the cron job which calls processOneStep directly.
// This HTTP endpoint exists as a fallback for manual triggers and the retry button.

import { NextResponse } from "next/server";
import { processOneStep } from "@/lib/extraction-runner";

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
  const result = await processOneStep(templateId);
  return NextResponse.json(result);
}
