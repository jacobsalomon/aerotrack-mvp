import { Sidebar } from "@/components/layout/sidebar";
import { ExecutiveDemoOverlay } from "@/components/demo/executive-demo-overlay";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(250, 250, 250)' }}>
      <Sidebar />
      <main className="min-h-screen px-4 pb-8 pt-20 sm:px-6 lg:ml-72 lg:px-8 lg:pt-8">
        {children}
        <ExecutiveDemoOverlay />
      </main>
    </div>
  );
}
