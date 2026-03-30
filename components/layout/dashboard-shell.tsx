"use client";

// Wraps sidebar + main content so sidebar collapse state is shared.
// Auto-collapses on job detail pages to give the inspection workspace more room.

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

interface Props {
  orgName: string | null;
  children: React.ReactNode;
}

// Job detail pages (/jobs/[id]) get a collapsed sidebar by default
function isJobDetailPage(pathname: string) {
  return /\/jobs\/[^/]+$/.test(pathname);
}

export function DashboardShell({ orgName, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-collapse when entering a job detail page, expand when leaving
  useEffect(() => {
    setCollapsed(isJobDetailPage(pathname));
  }, [pathname]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "rgb(250, 250, 250)" }}>
      <Sidebar
        orgName={orgName}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <main
        className={`min-h-screen px-4 pb-8 pt-20 sm:px-6 lg:px-8 lg:pt-8 transition-[margin] duration-200 ${
          collapsed ? "lg:ml-16" : "lg:ml-72"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
