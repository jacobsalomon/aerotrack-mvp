"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Opportunity", href: "#opportunity" },
  { label: "Why Now", href: "#why-now" },
  { label: "Approach", href: "#approach" },
  { label: "Vision", href: "#vision" },
];

// Sticky navigation bar.
// Starts transparent over the dark hero, transitions to dark solid
// with subtle bottom border once the user scrolls past 50px.
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on anchor link click
  const handleLinkClick = () => setMobileOpen(false);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-dark-950/95 backdrop-blur-sm border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Company name / wordmark */}
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-white transition-colors duration-300"
        >
          MVC
        </Link>

        {/* Desktop section links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors duration-300 hover:text-white ${
                scrolled ? "text-white/70" : "text-white/80"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Primary CTA + mobile hamburger */}
        <div className="flex items-center gap-4">
          <Link
            href="/aerovision/glasses-demo"
            className="hidden sm:inline-flex items-center rounded-sm bg-cream-200 px-5 py-2 text-sm font-medium text-dark-950 transition-all duration-300 hover:bg-cream-300"
          >
            See It in Action
          </Link>

          {/* Mobile hamburger toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-white transition-colors duration-300"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu — dark to match the page */}
      {mobileOpen && (
        <div className="md:hidden bg-dark-950 border-t border-white/10">
          <div className="flex flex-col px-6 py-4 gap-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleLinkClick}
                className="text-white/70 hover:text-white font-medium text-sm py-2 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/aerovision/glasses-demo"
              onClick={handleLinkClick}
              className="inline-flex items-center justify-center rounded-sm bg-cream-200 px-5 py-2.5 text-sm font-medium text-dark-950 hover:bg-cream-300 transition-colors"
            >
              See It in Action
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
