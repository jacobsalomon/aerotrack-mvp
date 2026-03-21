// GET /api/inspect/templates — Find inspection templates for a component
// Looks up via ComponentInspectionTemplate join table AND partNumbersCovered matching

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    if (!authResult.user.organizationId) {
      return NextResponse.json({ success: false, error: "No organization assigned" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get("componentId");
    const partNumber = searchParams.get("partNumber");

    if (!componentId && !partNumber) {
      return NextResponse.json({ success: false, error: "componentId or partNumber required" }, { status: 400 });
    }

    const orgId = authResult.user.organizationId;

    // Find templates linked via join table
    const linkedTemplateIds: string[] = [];
    if (componentId) {
      const links = await prisma.componentInspectionTemplate.findMany({
        where: { componentId },
        select: { templateId: true },
      });
      linkedTemplateIds.push(...links.map((l) => l.templateId));
    }

    // Find templates matching by partNumbersCovered
    const allTemplates = await prisma.inspectionTemplate.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["active", "review_ready"] },
        OR: [
          ...(linkedTemplateIds.length > 0 ? [{ id: { in: linkedTemplateIds } }] : []),
          ...(partNumber ? [{ partNumbersCovered: { has: partNumber } }] : []),
        ],
      },
      include: {
        sections: {
          select: {
            id: true,
            items: {
              select: {
                id: true,
                configurationApplicability: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Deduplicate (a template could match both ways)
    const seen = new Set<string>();
    const results = allTemplates
      .filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .map((t) => {
        // Collect unique config variants from items
        const variants = new Set<string>();
        let itemCount = 0;
        for (const section of t.sections) {
          itemCount += section.items.length;
          for (const item of section.items) {
            for (const v of item.configurationApplicability) {
              variants.add(v);
            }
          }
        }

        return {
          id: t.id,
          title: t.title,
          revisionDate: t.revisionDate?.toISOString() || null,
          version: t.version,
          status: t.status,
          sectionCount: t.sections.length,
          itemCount,
          configVariants: [...variants].sort(),
        };
      });

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[inspect/templates GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load templates" }, { status: 500 });
  }
}
