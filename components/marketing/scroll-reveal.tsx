"use client";

import { useEffect, useRef, useState } from "react";

type AnimationType = "fade-in-up" | "fade-in-left" | "fade-in-right";

interface ScrollRevealProps {
  children: React.ReactNode;
  animation?: AnimationType;
  delay?: number; // 0-4, maps to scroll-delay-X classes
  className?: string;
  threshold?: number;
}

// Reusable scroll-triggered animation wrapper.
// Wraps children in a div that starts invisible and animates in
// when it enters the viewport via Intersection Observer.
export default function ScrollReveal({
  children,
  animation = "fade-in-up",
  delay = 0,
  className = "",
  threshold = 0.1,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Check if user prefers reduced motion — skip observer entirely
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Only trigger once — stop observing after reveal
          observer.unobserve(element);
        }
      },
      { threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold]);

  // Build class list: hidden by default, then animation + optional delay when visible
  const animationClass = isVisible
    ? `scroll-${animation}${delay > 0 ? ` scroll-delay-${delay}` : ""}`
    : "scroll-hidden";

  return (
    <div ref={ref} className={`${animationClass} ${className}`}>
      {children}
    </div>
  );
}
