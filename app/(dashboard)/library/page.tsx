// CMM Library page — shows all uploaded CMM inspection templates for the org.
// Any authenticated user can upload and manage templates.

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LibraryClient from "./library-client";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/login");
  }

  // Fetch all templates for this org with section counts
  const templates = await prisma.inspectionTemplate.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { sections: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return (
    <LibraryClient
      templates={templates.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        sourceFileUrl: t.sourceFileUrl,
        partNumbersCovered: t.partNumbersCovered,
        oem: t.oem ?? null,
        revisionDate: t.revisionDate?.toISOString() ?? null,
        totalPages: t.totalPages,
        sectionCount: t._count.sections,
        createdAt: t.createdAt.toISOString(),
        createdBy: t.createdBy.name ?? t.createdBy.email ?? "Unknown",
        currentSectionIndex: t.currentSectionIndex,
      }))}
    />
  );
}
