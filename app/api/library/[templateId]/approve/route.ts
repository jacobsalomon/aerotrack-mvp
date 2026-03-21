// POST /api/library/[templateId]/approve — Approve a template and trigger auto-linking

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { linkTemplateToComponents } from "@/lib/component-template-linking";

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
    include: { sections: { select: { status: true } } },
  });

  if (!template || template.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check all sections are extracted or reviewed (no pending/extracting)
  const hasUnfinished = template.sections.some(
    (s) => s.status === "pending" || s.status === "extracting"
  );
  if (hasUnfinished) {
    return NextResponse.json(
      { error: "All sections must be extracted before approval" },
      { status: 400 }
    );
  }

  // Set template to active
  await prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: { status: "active" },
  });

  // Auto-link to components by part number
  const linkedCount = await linkTemplateToComponents(template);

  // Audit log
  await prisma.auditLogEntry.create({
    data: {
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "cmm_template_approved",
      entityType: "InspectionTemplate",
      entityId: templateId,
      metadata: {
        title: template.title,
        partNumbers: template.partNumbersCovered,
        componentsLinked: linkedCount,
      },
    },
  });

  return NextResponse.json({ success: true, linkedCount });
}
