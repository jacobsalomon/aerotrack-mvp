// POST   /api/library/[templateId]/sections/[sectionId]/items — Create a new item
// PATCH  /api/library/[templateId]/sections/[sectionId]/items — Update an existing item (id in body)
// DELETE /api/library/[templateId]/sections/[sectionId]/items — Delete an item (id in body)

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

async function verifyAccess(templateId: string, sectionId: string, userId: string, orgId: string) {
  const section = await prisma.inspectionSection.findUnique({
    where: { id: sectionId },
    include: { template: true },
  });
  if (!section || section.templateId !== templateId || section.template.organizationId !== orgId) {
    return null;
  }
  return section;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { templateId, sectionId } = await params;
  const section = await verifyAccess(templateId, sectionId, session.user.id, session.user.organizationId);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // Get the next sort order
  const maxItem = await prisma.inspectionItem.findFirst({
    where: { sectionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const item = await prisma.inspectionItem.create({
    data: {
      sectionId,
      itemType: body.itemType || "general_note",
      itemCallout: body.itemCallout || null,
      partNumber: body.partNumber || null,
      parameterName: body.parameterName,
      specification: body.specification || "",
      specValueLow: body.specValueLow ?? null,
      specValueHigh: body.specValueHigh ?? null,
      specUnit: body.specUnit || null,
      specValueLowMetric: body.specValueLowMetric ?? null,
      specValueHighMetric: body.specValueHighMetric ?? null,
      specUnitMetric: body.specUnitMetric || null,
      toolsRequired: body.toolsRequired || [],
      checkReference: body.checkReference || null,
      repairReference: body.repairReference || null,
      specialAssemblyRef: body.specialAssemblyRef || null,
      configurationApplicability: body.configurationApplicability || [],
      notes: body.notes || null,
      sortOrder: (maxItem?.sortOrder ?? -1) + 1,
      confidence: 1.0, // Manually added items are high confidence
      editedById: session.user.id,
      editedAt: new Date(),
    },
  });

  // Update section item count
  await prisma.inspectionSection.update({
    where: { id: sectionId },
    data: { itemCount: { increment: 1 } },
  });

  return NextResponse.json({ item });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ templateId: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { templateId, sectionId } = await params;
  const section = await verifyAccess(templateId, sectionId, session.user.id, session.user.organizationId);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Item id required" }, { status: 400 });

  // "approve" action: clear the review flag without editing the item
  if (body.action === "approve") {
    const item = await prisma.inspectionItem.update({
      where: { id: body.id },
      data: {
        reviewReason: null,
        confidence: Math.max(0.7, (await prisma.inspectionItem.findUnique({ where: { id: body.id }, select: { confidence: true } }))?.confidence ?? 0.7),
        editedById: session.user.id,
        editedAt: new Date(),
      },
    });
    return NextResponse.json({ item });
  }

  const item = await prisma.inspectionItem.update({
    where: { id: body.id },
    data: {
      ...(body.itemType !== undefined && { itemType: body.itemType }),
      ...(body.itemCallout !== undefined && { itemCallout: body.itemCallout || null }),
      ...(body.partNumber !== undefined && { partNumber: body.partNumber || null }),
      ...(body.parameterName !== undefined && { parameterName: body.parameterName }),
      ...(body.specification !== undefined && { specification: body.specification }),
      ...(body.specValueLow !== undefined && { specValueLow: body.specValueLow }),
      ...(body.specValueHigh !== undefined && { specValueHigh: body.specValueHigh }),
      ...(body.specUnit !== undefined && { specUnit: body.specUnit || null }),
      ...(body.specValueLowMetric !== undefined && { specValueLowMetric: body.specValueLowMetric }),
      ...(body.specValueHighMetric !== undefined && { specValueHighMetric: body.specValueHighMetric }),
      ...(body.specUnitMetric !== undefined && { specUnitMetric: body.specUnitMetric || null }),
      ...(body.toolsRequired !== undefined && { toolsRequired: body.toolsRequired }),
      ...(body.checkReference !== undefined && { checkReference: body.checkReference || null }),
      ...(body.repairReference !== undefined && { repairReference: body.repairReference || null }),
      ...(body.notes !== undefined && { notes: body.notes || null }),
      ...(body.configurationApplicability !== undefined && { configurationApplicability: body.configurationApplicability }),
      reviewReason: null, // Editing an item implicitly approves it
      editedById: session.user.id,
      editedAt: new Date(),
    },
  });

  return NextResponse.json({ item });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ templateId: string; sectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { templateId, sectionId } = await params;
  const section = await verifyAccess(templateId, sectionId, session.user.id, session.user.organizationId);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Item id required" }, { status: 400 });

  await prisma.inspectionItem.delete({ where: { id: body.id } });

  // Update section item count
  await prisma.inspectionSection.update({
    where: { id: sectionId },
    data: { itemCount: { decrement: 1 } },
  });

  return NextResponse.json({ success: true });
}
