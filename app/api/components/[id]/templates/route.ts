// GET /api/components/[id]/templates — Get active inspection templates linked to a component

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const links = await prisma.componentInspectionTemplate.findMany({
    where: { componentId: id },
    include: {
      template: {
        select: {
          id: true,
          title: true,
          status: true,
          partNumbersCovered: true,
          revisionDate: true,
          sourceFileName: true,
        },
      },
    },
  });

  // Only return active templates
  const activeTemplates = links
    .filter((l) => l.template.status === "active")
    .map((l) => l.template);

  return NextResponse.json({ templates: activeTemplates });
}
