// GET /api/library/[templateId] — Get a template with all sections and items

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
