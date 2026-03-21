// POST /api/library/[templateId]/retry
// Retries extraction for a template — resets to pending, clears lease,
// deletes existing sections/items for a fresh start, then re-triggers extraction.

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Statuses that are eligible for retry
const RETRYABLE_STATUSES = [
  "pending_extraction",
  "extracting_index",
  "extracting_details",
  "extraction_failed",
];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { templateId } = await params;

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, organizationId: true, status: true },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify org membership
  if (template.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Only allow retry on eligible statuses
  if (!RETRYABLE_STATUSES.includes(template.status)) {
    return NextResponse.json(
      { error: "Template is not in a retryable state" },
      { status: 400 }
    );
  }

  // Fresh start: delete existing sections/items and reset template state
  await prisma.$transaction([
    prisma.inspectionItem.deleteMany({
      where: { section: { templateId } },
    }),
    prisma.inspectionSection.deleteMany({
      where: { templateId },
    }),
    prisma.inspectionTemplate.update({
      where: { id: templateId },
      data: {
        status: "pending_extraction",
        extractionRunnerToken: null,
        extractionLeaseExpiresAt: null,
        currentSectionIndex: 0,
        extractionMetadata: Prisma.DbNull,
        rawExtractionResponses: Prisma.DbNull,
      },
    }),
  ]);

  // Trigger extraction pipeline (fire-and-forget)
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const secret =
    process.env.INTERNAL_API_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";

  fetch(`${baseUrl}${basePath}/api/library/${templateId}/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
  }).catch((err) => {
    console.error("[Library] Failed to trigger extraction retry:", err);
  });

  return NextResponse.json({ success: true });
}
