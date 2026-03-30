import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ExecutiveDemoOverlay } from "@/components/demo/executive-demo-overlay";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch org name for the sidebar (shows on every page)
  let orgName: string | null = null;
  try {
    const session = await auth();
    if (session?.user?.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { name: true },
      });
      orgName = org?.name ?? null;
    }
  } catch {
    // Non-critical — sidebar just won't show org name
  }

  return (
    <DashboardShell orgName={orgName}>
      {children}
      <ExecutiveDemoOverlay />
    </DashboardShell>
  );
}
