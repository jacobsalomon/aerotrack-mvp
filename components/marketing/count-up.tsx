"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  // The target number to count up to (e.g. 25, 1.9, 2, 17.6, 65)
  end: number;
  // Text to show before the number (e.g. "$")
  prefix?: string;
  // Text to show after the number (e.g. "%", "M", "T+")
  suffix?: string;
  // How many decimal places to show (e.g. 1 for "1.9")
  decimals?: number;
  // Animation duration in milliseconds
  duration?: number;
  // Additional CSS classes for the number
  className?: string;
}

// Animated number counter that counts up from 0 when scrolled into view.
// Uses Intersection Observer to detect visibility and requestAnimationFrame
// for smooth 60fps animation with an ease-out curve.
// Respects prefers-reduced-motion — shows final number instantly.
export default function CountUp({
  end,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 2000,
  className = "",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Respect reduced motion — show final value immediately
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setDisplay(`${prefix}${end.toFixed(decimals)}${suffix}`);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.unobserve(element);
          animate();
        }
      },
      { threshold: 0.3 }
    );

    // Ease-out cubic curve — starts fast, slows down at the end
    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    function animate() {
      const startTime = performance.now();

      function tick(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const current = easedProgress * end;

        setDisplay(`${prefix}${current.toFixed(decimals)}${suffix}`);

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      }

      requestAnimationFrame(tick);
    }

    observer.observe(element);

    return () => observer.disconnect();
  }, [end, prefix, suffix, decimals, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
