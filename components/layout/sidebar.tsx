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
} from "lucide-react";

const navItems = [
  { href: "/demo", label: "Executive Demo", icon: Play },
  { href: "/dashboard", label: "Parts Fleet", icon: LayoutDashboard },
  { href: "/capture", label: "Capture Tool", icon: ScanLine },
  { href: "/knowledge", label: "Knowledge Library", icon: BookOpen },
  { href: "/integrity", label: "Integrity", icon: ShieldCheck },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 px-5 py-5 border-b border-slate-700">
        <Plane className="h-7 w-7 text-blue-400" />
        <span className="text-xl font-bold tracking-tight">AeroTrack</span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-700 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
        <p>AeroTrack MVP</p>
        <p>Built for Parker Aerospace</p>
      </div>
    </aside>
  );
}
