"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  LogOut,
  Menu,
  Plane,
  Settings,
  Users,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
};

const primaryNavItems: NavItem[] = [
  {
    href: "/jobs",
    label: "Jobs",
    icon: ClipboardCheck,
    description: "Your work orders and inspections",
  },
];

const supportNavItems: NavItem[] = [
  {
    href: "/forms",
    label: "Forms",
    icon: FileText,
  },
  {
    href: "/library",
    label: "Templates",
    icon: BookOpen,
    description: "CMM inspection templates",
  },
  {
    href: "/technicians",
    label: "Team",
    icon: Users,
  },
];

// Demo pages kept in codebase but hidden from production nav
const onboardingNavItems: NavItem[] = [];

const allNavItems = [
  ...primaryNavItems,
  ...supportNavItems,
  ...onboardingNavItems,
  { href: "/settings", label: "Settings", icon: Settings } as NavItem,
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  pathname,
  title,
  items,
  onNavigate,
}: {
  pathname: string;
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div>
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {title}
      </p>
      <div className="mt-3 space-y-1">
        {items.map((item) => {
          const isActive = isActivePath(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-start gap-3 rounded-2xl px-3 py-3 transition-all",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/68 hover:bg-white/6 hover:text-white"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all",
                  isActive
                    ? "border-white/10 bg-white/12"
                    : "border-white/8 bg-white/[0.03] group-hover:border-white/12 group-hover:bg-white/[0.08]"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-white/45">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarBody({
  pathname,
  onNavigate,
  orgName,
}: {
  pathname: string;
  onNavigate?: () => void;
  orgName?: string | null;
}) {
  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "rgb(12, 12, 12)" }}
    >
      <Link
        href="/"
        onClick={onNavigate}
        className="border-b px-5 py-5"
        style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/6">
            <Plane className="h-5 w-5" style={{ color: "rgb(230, 227, 224)" }} />
          </span>
          <div>
            <p
              className="text-xl font-bold tracking-tight"
              style={{ color: "rgb(230, 227, 224)" }}
            >
              AeroVision
            </p>
            <p className="text-xs text-white/40">{orgName || "AI-powered maintenance docs"}</p>
          </div>
        </div>
      </Link>

      <nav className="flex-1 space-y-8 overflow-y-auto px-3 py-5">
        <NavSection
          pathname={pathname}
          title="Workflow"
          items={primaryNavItems}
          onNavigate={onNavigate}
        />
        <NavSection
          pathname={pathname}
          title="Operations"
          items={supportNavItems}
          onNavigate={onNavigate}
        />
        {onboardingNavItems.length > 0 && (
          <NavSection
            pathname={pathname}
            title="Intro & Onboarding"
            items={onboardingNavItems}
            onNavigate={onNavigate}
          />
        )}
      </nav>

      <div
        className="border-t px-5 py-4"
        style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
            pathname === "/settings"
              ? "bg-white/10 text-white"
              : "text-white/50 hover:bg-white/6 hover:text-white/80"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login` })}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/50 transition-colors hover:bg-white/6 hover:text-white/80"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
        {orgName && (
          <p className="mt-3 px-3 text-xs truncate" style={{ color: "rgba(255, 255, 255, 0.34)" }}>
            {orgName}
          </p>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ orgName }: { orgName?: string | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = allNavItems.find((item) => isActivePath(pathname, item.href));

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-30 border-b px-4 py-3 lg:hidden"
        style={{
          backgroundColor: "rgba(12, 12, 12, 0.94)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/6">
                <Plane className="h-5 w-5" style={{ color: "rgb(230, 227, 224)" }} />
              </span>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: "rgb(230, 227, 224)" }}
                >
                  {activeItem?.label || "AeroVision"}
                </p>
                <p className="truncate text-xs text-white/40">
                  {activeItem?.description || orgName || "AI-powered maintenance docs"}
                </p>
              </div>
            </div>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-2xl text-white hover:bg-white/8 hover:text-white"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:flex"
        aria-label="Sidebar navigation"
      >
        <SidebarBody pathname={pathname} orgName={orgName} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[88vw] max-w-sm border-r-0 p-0"
          showCloseButton
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Primary demo navigation and supporting pages.
          </SheetDescription>
          <SidebarBody
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
            orgName={orgName}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
