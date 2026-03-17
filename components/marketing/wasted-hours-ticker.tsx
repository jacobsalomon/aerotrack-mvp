"use client";

import { useEffect, useRef, useState } from "react";
import HudScan from "@/components/marketing/hud-scan";

// Math behind the ticker:
// 1.5M US maintenance & repair technicians (BLS) × 8-hour shifts
// × 40% of shift on documentation (conservative — aerospace is ~60%)
// = 4.8M hours lost per day
// = 4,800,000 / 86,400 seconds ≈ 55.6 hours per second
const HOURS_PER_SECOND = 55;

export default function WastedHoursTicker() {
  const [hours, setHours] = useState(0);
  const startRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      setHours(elapsed * HOURS_PER_SECOND);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // Format with commas and no decimals
  const formatted = Math.floor(hours).toLocaleString("en-US");

  return (
    <section className="relative px-6 py-32 md:py-44 bg-dark-950 overflow-hidden">
      {/* Computer-vision HUD grid + scan line animation */}
      <HudScan />

      {/* Subtle pulsing glow behind the number */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[600px] h-[300px] rounded-full opacity-[0.06]"
          style={{
            background:
              "radial-gradient(ellipse, rgba(255,100,100,0.8), transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="text-white/40 text-sm uppercase tracking-[0.2em] mb-6">
          Since you opened this page
        </p>

        {/* The big ticking number */}
        <div
          className="font-display text-6xl md:text-8xl lg:text-9xl font-bold text-white tracking-tight tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {formatted}
        </div>

        <p className="mt-6 text-xl md:text-2xl text-white/60 max-w-xl mx-auto leading-relaxed">
          hours of skilled labor lost to paperwork across America
        </p>

        <p className="mt-3 text-sm text-white/30">
          Based on 1.5M US maintenance technicians &times; 40% documentation time
        </p>
      </div>
    </section>
  );
}
