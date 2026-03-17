"use client";

import { useEffect, useRef } from "react";

// Hair-thin progress bar fixed to the top of the viewport.
// Fills left-to-right as the user scrolls down the page.
// Uses a ref for direct DOM updates — no React re-renders on scroll.
export default function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!barRef.current) return;
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? scrollTop / docHeight : 0;
      barRef.current.style.transform = `scaleX(${progress})`;
    };

    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none">
      <div
        ref={barRef}
        className="h-full bg-cream-200/80 origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
