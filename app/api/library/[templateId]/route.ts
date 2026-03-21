// GET    /api/library/[templateId] — Get a template with all sections and items
// DELETE /api/library/[templateId] — Delete a template and its sections/items

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(
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
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify org membership
  if (template.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json({ template });
}

// DELETE — Remove a template and all related sections/items
export async function DELETE(
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
    select: { id: true, organizationId: true, status: true, title: true },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify org membership
  if (template.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Block deletion of active templates — must archive first
  if (template.status === "active") {
    return NextResponse.json(
      { error: "Cannot delete an active template. Archive it first." },
      { status: 400 }
    );
  }

  // Delete template and cascade to sections/items in a transaction
  await prisma.$transaction([
    // Delete all items belonging to this template's sections
    prisma.inspectionItem.deleteMany({
      where: { section: { templateId } },
    }),
    // Delete all sections
    prisma.inspectionSection.deleteMany({
      where: { templateId },
    }),
    // Delete the template itself
    prisma.inspectionTemplate.delete({
      where: { id: templateId },
    }),
  ]);

  // Audit log
  await prisma.auditLogEntry.create({
    data: {
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "cmm_deleted",
      entityType: "InspectionTemplate",
      entityId: templateId,
      metadata: { title: template.title },
    },
  });

  return NextResponse.json({ success: true });
}
