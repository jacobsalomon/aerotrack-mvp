// POST /api/library/[templateId]/cancel
// Cancels an in-progress extraction by setting the template status to failed.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

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

  // Only allow cancel on actively extracting templates
  if (template.status !== "extracting_index" && template.status !== "extracting_details") {
    return NextResponse.json(
      { error: "Can only cancel in-progress extractions" },
      { status: 400 }
    );
  }

  // Mark as failed
  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      status: "extraction_failed",
    },
  });

  return NextResponse.json({ success: true });
}
