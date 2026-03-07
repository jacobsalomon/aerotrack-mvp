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
      <main className="ml-60 p-8">
        {children}
        <ExecutiveDemoOverlay />
      </main>
    </div>
  );
}
