import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { MAX_INSTANCE_COUNT } from "@/lib/inspect/cmm-config";

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const body = await request.json();
    const { componentId, templateId, configurationVariant, workOrderRef } = body;

    if (!templateId) {
      return NextResponse.json({ success: false, error: "templateId is required" }, { status: 400 });
    }

    // Load template with sections and items
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
      },
    });

    if (!template || template.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    if (template.status !== "active" && template.status !== "review_ready") {
      return NextResponse.json({ success: false, error: "Template is not active" }, { status: 400 });
    }

    // Collect applicable items with their instance counts (filtered by config variant)
    const applicableItems: { itemId: string; instanceCount: number }[] = [];
    for (const section of template.sections) {
      // Skip sections not applicable to this config variant
      if (configurationVariant && section.configurationApplicability.length > 0 &&
          !section.configurationApplicability.includes(configurationVariant)) {
        continue;
      }
      for (const item of section.items) {
        // Skip items not applicable to this config variant
        if (configurationVariant && item.configurationApplicability.length > 0 &&
            !item.configurationApplicability.includes(configurationVariant)) {
          continue;
        }
        // Cap instance count at MAX_INSTANCE_COUNT to prevent runaway records
        const count = Math.min(Math.max(item.instanceCount, 1), MAX_INSTANCE_COUNT);
        applicableItems.push({ itemId: item.id, instanceCount: count });
      }
    }

    // Create session + progress records in a transaction
    const session = await prisma.$transaction(async (tx) => {
      const newSession = await tx.captureSession.create({
        data: {
          userId: authResult.user.id,
          organizationId: authResult.user.organizationId!,
          componentId: componentId || null,
          status: "inspecting",
          sessionType: "inspection",
          inspectionTemplateId: templateId,
          inspectionTemplateVersion: template.version,
          configurationVariant: configurationVariant || null,
          workOrderRef: workOrderRef || null,
          activeInspectionSectionId: template.sections[0]?.id || null,
        },
      });

      // Create InspectionProgress records for every applicable item-instance (all start as "pending")
      // Multi-instance items get N records (one per instance), single items get 1 record with instanceIndex 0
      const progressData: { captureSessionId: string; inspectionItemId: string; instanceIndex: number; status: string }[] = [];
      for (const { itemId, instanceCount } of applicableItems) {
        for (let i = 0; i < instanceCount; i++) {
          progressData.push({
            captureSessionId: newSession.id,
            inspectionItemId: itemId,
            instanceIndex: i,
            status: "pending",
          });
        }
      }

      if (progressData.length > 0) {
        await tx.inspectionProgress.createMany({ data: progressData });
      }

      return newSession;
    });

    return NextResponse.json({ success: true, data: { sessionId: session.id } }, { status: 201 });
  } catch (error) {
    console.error("[inspect/sessions POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create inspection session" }, { status: 500 });
  }
}
