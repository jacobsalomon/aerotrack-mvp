// POST /api/library/[templateId]/retry
// Retries extraction for a failed template.
// Resets failed sections to pending and re-triggers the extraction pipeline.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Only allow retry on failed templates
  if (template.status !== "extraction_failed") {
    return NextResponse.json(
      { error: "Can only retry failed extractions" },
      { status: 400 }
    );
  }

  // Reset any failed sections back to pending
  await prisma.inspectionSection.updateMany({
    where: { templateId, status: "failed" },
    data: { status: "pending" },
  });

  // Reset template status to pending_extraction to restart the pipeline
  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      status: "pending_extraction",
    },
  });

  // Trigger extraction pipeline (fire-and-forget)
  try {
    fetch(apiUrl(`/api/library/${templateId}/extract`), {
      method: "POST",
    }).catch(() => {
      // Non-critical — pipeline will self-recover
    });
  } catch {
    // Swallow — the status change is what matters
  }

  return NextResponse.json({ success: true });
}
