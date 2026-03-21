// /inspect/[sessionId]/audit — Evidence provenance audit page
// Shows every inspection item alongside its linked evidence sources
// (transcript text, audio clips, video frames) so anyone can verify
// where each captured value came from.

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import AuditScreen from "@/components/inspect/audit-screen";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function AuditPage({ params }: PageProps) {
  const { sessionId } = await params;

  // Light check — just verify session exists and is an inspection type.
  // The full data load happens client-side via the audit API endpoint
  // so we get loading states and lazy media loading.
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      sessionType: true,
      organizationId: true,
    },
  });

  if (!session || session.sessionType !== "inspection") {
    redirect("/inspect");
  }

  return <AuditScreen sessionId={sessionId} />;
}
