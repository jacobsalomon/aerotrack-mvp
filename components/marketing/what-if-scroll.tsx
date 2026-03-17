"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Each "What If" statement becomes a full-viewport cinematic moment.
// The section is tall (one viewport per slide), and a sticky frame
// stays pinned while the slides crossfade as you scroll through.
// Background images for each slide (Unsplash, free for commercial use).
// Shown at very low opacity behind the text for atmospheric depth.
const slides = [
  { type: "intro" as const, text: "What if...", bg: "/whatif-1.webp" },
  {
    type: "statement" as const,
    text: "What if technicians never touched a form again?",
    bg: "/whatif-2.webp",
  },
  {
    type: "statement" as const,
    text: "What if every repair, every inspection, every maintenance task documented itself \u2014 automatically, accurately, instantly?",
    bg: "/whatif-3.webp",
  },
  {
    type: "statement" as const,
    text: "What if we could give every skilled worker in America back a third of their day?",
    bg: "/whatif-4.webp",
  },
  {
    type: "final" as const,
    text: "What if the people who build everything could just\u2026 ",
    highlight: "build?",
    bg: "/whatif-5.webp",
  },
  {
    type: "cta" as const,
    text: "That\u2019s what we\u2019re building.",
    bg: "/whatif-6.webp",
  },
];

export default function WhatIfScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [fadeOpacity, setFadeOpacity] = useState(1);
  // Start in static mode (safe for SSR + reduced motion).
  // Upgrades to scroll-driven on mount if no reduced-motion preference.
  const [isScrollDriven, setIsScrollDriven] = useState(false);

  useEffect(() => {
    // Respect user preference for reduced motion — keep stacked layout
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setIsScrollDriven(true);

    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const scrolled = -rect.top; // how far into the section
      const total = el.offsetHeight - window.innerHeight;

      // Before the section: show first slide
      if (scrolled <= 0) {
        setActive(0);
        setFadeOpacity(1);
        return;
      }

      // Past the section: show last slide
      if (scrolled >= total) {
        setActive(slides.length - 1);
        setFadeOpacity(1);
        return;
      }

      // Map scroll position to slide index + opacity
      const progress = scrolled / total; // 0 → 1
      const expanded = progress * slides.length;
      const idx = Math.min(Math.floor(expanded), slides.length - 1);
      const within = expanded - idx; // 0 → 1 within this slide's zone

      setActive(idx);

      // Crossfade: fade-in over first 20%, hold, fade-out over last 20%.
      // First slide skips fade-in (visible immediately).
      // Last slide skips fade-out (stays visible).
      let o = 1;
      if (idx > 0 && within < 0.2) {
        o = within / 0.2;
      } else if (within > 0.8 && idx < slides.length - 1) {
        o = (1 - within) / 0.2;
      }
      setFadeOpacity(Math.max(0, Math.min(1, o)));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Reduced-motion fallback: stacked paragraphs (matches original layout) ──
  if (!isScrollDriven) {
    return (
      <section className="relative px-6 py-32 md:py-40 bg-gradient-to-b from-dark-800 to-dark-950 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl">
          <p className="text-2xl md:text-3xl font-light italic text-white/50">
            What if...
          </p>
          <div className="mt-12 space-y-12">
            <p className="font-display text-2xl md:text-4xl font-bold text-white leading-snug">
              What if technicians never touched a form again?
            </p>
            <p className="font-display text-2xl md:text-4xl font-bold text-white leading-snug">
              What if every repair, every inspection, every maintenance task
              documented itself &mdash; automatically, accurately, instantly?
            </p>
            <p className="font-display text-2xl md:text-4xl font-bold text-white leading-snug">
              What if we could give every skilled worker in America back a third
              of their day?
            </p>
            <p className="font-display text-2xl md:text-4xl font-bold text-white/90 leading-snug">
              What if the people who build everything could just&hellip;{" "}
              <span className="text-cream-200">build?</span>
            </p>
          </div>
          <div className="mt-16 flex flex-col sm:flex-row items-start gap-4">
            <p className="text-white/50 text-lg">
              That&rsquo;s what we&rsquo;re building.
            </p>
            <Link
              href="/aerovision/glasses-demo"
              className="inline-flex items-center gap-2 text-cream-200 hover:text-white text-lg font-medium transition-colors"
            >
              See it in action <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ── Scroll-driven cinematic version ──
  return (
    <section
      ref={containerRef}
      className="relative bg-gradient-to-b from-dark-800 to-dark-950"
      style={{ height: `${slides.length * 100}vh` }}
    >
      {/* Sticky viewport — stays pinned while you scroll through the section */}
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Subtle dot pattern for visual consistency */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Progress dots — small indicator on the right edge */}
        <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
          {slides.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === active ? "6px" : "4px",
                height: i === active ? "6px" : "4px",
                backgroundColor:
                  i === active
                    ? "rgba(255,255,255,0.5)"
                    : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>

        {/* Slides — stacked via absolute positioning, crossfade on scroll */}
        {slides.map((slide, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              opacity: active === i ? fadeOpacity : 0,
              pointerEvents: active === i ? "auto" : "none",
            }}
          >
            {/* Background image — low opacity atmospheric layer */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
              style={{
                backgroundImage: `url('${slide.bg}')`,
                opacity: 0.08,
              }}
            />
            {/* Dark gradient overlay to ensure text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-dark-950/60 via-transparent to-dark-950/60" />

            {/* Text content — centered with subtle rise animation */}
            <div
              className="absolute inset-0 flex items-center justify-center px-8 md:px-20"
              style={{
                transform: `translateY(${active === i ? (1 - fadeOpacity) * 24 : 24}px)`,
              }}
            >
            <div className="relative z-10 max-w-3xl text-center">
              {slide.type === "intro" && (
                <p className="font-display text-3xl md:text-5xl lg:text-6xl font-bold italic text-white/50">
                  {slide.text}
                </p>
              )}
              {slide.type === "statement" && (
                <p className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
                  {slide.text}
                </p>
              )}
              {slide.type === "final" && (
                <p className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-white/90 leading-tight">
                  {slide.text}
                  <span className="text-cream-200">{slide.highlight}</span>
                </p>
              )}
              {slide.type === "cta" && (
                <div className="flex flex-col items-center gap-8">
                  <p className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-white/50 leading-tight">
                    {slide.text}
                  </p>
                  <Link
                    href="/aerovision/glasses-demo"
                    className="inline-flex items-center gap-2 text-cream-200 hover:text-white text-lg font-medium transition-colors"
                  >
                    See it in action <ArrowRight size={18} />
                  </Link>
                </div>
              )}
            </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
