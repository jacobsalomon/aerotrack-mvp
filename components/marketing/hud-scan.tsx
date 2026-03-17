"use client";

import { useEffect, useRef } from "react";

// Minimal vision-system effect: just a single scan line sweeping
// slowly downward. Hints at "camera / AI watching" without clutter.
// Pure canvas — no libraries. Respects reduced motion.
const SCAN_SPEED = 0.00008; // how fast the scan line moves
const SCAN_HEIGHT = 160; // height of the scan line glow in pixels
const SCAN_OPACITY = 0.1; // peak brightness of the scan line

export default function HudScan() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // No animation needed for reduced-motion — component is invisible
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Sweeping scan line — moves top to bottom, then loops
      const scanY = (time * SCAN_SPEED * height) % (height + SCAN_HEIGHT * 2) - SCAN_HEIGHT;

      // Draw as a soft horizontal gradient band
      const gradient = ctx.createLinearGradient(0, scanY - SCAN_HEIGHT / 2, 0, scanY + SCAN_HEIGHT / 2);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.5, `rgba(255,255,255,${SCAN_OPACITY})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, scanY - SCAN_HEIGHT / 2, width, SCAN_HEIGHT);

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
