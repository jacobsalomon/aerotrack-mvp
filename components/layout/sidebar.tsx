"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  BookOpen,
  ShieldCheck,
  BarChart3,
  Plane,
  Play,
  Smartphone,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/demo", label: "Executive Demo", icon: Play },
  { href: "/dashboard", label: "Parts Fleet", icon: LayoutDashboard },
  { href: "/sessions", label: "Capture Sessions", icon: Smartphone },
  { href: "/capture", label: "Capture Tool", icon: ScanLine },
  { href: "/knowledge", label: "Knowledge Library", icon: BookOpen },
  { href: "/integrity", label: "Integrity", icon: ShieldCheck },
  { href: "/technicians", label: "Technicians", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 flex flex-col" style={{ backgroundColor: 'rgb(12, 12, 12)' }}>
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 px-5 py-5 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <Plane className="h-7 w-7" style={{ color: 'rgb(230, 227, 224)' }} />
        <span className="text-xl font-bold tracking-tight" style={{ color: 'rgb(230, 227, 224)' }}>AeroVision</span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "text-white"
                  : "hover:text-white"
              }`}
              style={isActive ? {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'rgb(230, 227, 224)'
              } : {
                color: 'rgba(255, 255, 255, 0.6)'
              }}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t text-xs" style={{ borderColor: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.3)' }}>
        <p>AeroVision MVP</p>
        <p>The Mechanical Vision Corporation</p>
      </div>
    </aside>
  );
}
