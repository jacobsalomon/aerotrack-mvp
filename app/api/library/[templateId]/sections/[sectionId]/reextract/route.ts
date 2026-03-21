// POST /api/library/[templateId]/sections/[sectionId]/reextract
// Re-run Pass 2 extraction for a single section (deletes existing items first)

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { extractSection } from "@/lib/ai/cmm-extraction-pass2";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ templateId: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { templateId, sectionId } = await params;

  const section = await prisma.inspectionSection.findUnique({
    where: { id: sectionId },
    include: { template: true },
  });

  if (!section || section.templateId !== templateId || section.template.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete existing items for this section
  await prisma.inspectionItem.deleteMany({ where: { sectionId } });

  // Reset section status
  await prisma.inspectionSection.update({
    where: { id: sectionId },
    data: { status: "pending", itemCount: 0, extractionConfidence: 0 },
  });

  // Run extraction
  const itemCount = await extractSection(templateId, sectionId);

  return NextResponse.json({ success: true, itemCount });
}
