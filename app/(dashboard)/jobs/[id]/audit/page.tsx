// /jobs/[id]/audit — Evidence provenance audit page
// Shows every inspection item alongside its linked evidence sources

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import AuditScreen from "@/components/inspect/audit-screen";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobAuditPage({ params }: PageProps) {
  const { id } = await params;

  const session = await prisma.captureSession.findUnique({
    where: { id },
    select: {
      id: true,
      sessionType: true,
      organizationId: true,
    },
  });

  if (!session || session.sessionType !== "inspection") {
    redirect("/jobs");
  }

  return <AuditScreen sessionId={id} />;
}
