import { Sidebar } from "@/components/layout/sidebar";
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
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(250, 250, 250)' }}>
      <Sidebar orgName={orgName} />
      <main className="min-h-screen px-4 pb-8 pt-20 sm:px-6 lg:ml-72 lg:px-8 lg:pt-8">
        {children}
        <ExecutiveDemoOverlay />
      </main>
    </div>
  );
}
