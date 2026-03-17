"use client";

import { useEffect, useRef } from "react";

// ── Configuration ──────────────────────────────────────────
const SPACING = 40; // pixels between dots
const DOT_RADIUS = 1; // base dot size
const MOUSE_RADIUS = 220; // how far the mouse influence reaches
const MOUSE_PUSH = 25; // how many pixels dots shift away from cursor
const LINE_DIST = 60; // max distance to draw a connecting line
const AMBIENT_AMOUNT = 3; // subtle drift even without mouse (pixels)
const AMBIENT_SPEED = 0.0004; // how fast the ambient drift cycles

// Mouse-reactive constellation grid for the hero section.
// Draws dots on a regular grid with lines connecting neighbors.
// Dots subtly shift away from the mouse cursor. When there's no
// mouse activity, dots gently drift in a slow wave pattern.
// Uses a single <canvas> element — no libraries.
export default function AnimatedGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect user preference for reduced motion — show static dots
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawStatic(canvas);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Track the display (CSS) size separately from the canvas pixel buffer
    let width = 0;
    let height = 0;

    // Dots stored as a flat array: [baseX, baseY] pairs
    let cols = 0;
    let rows = 0;

    // Resize canvas to match its CSS size at the device pixel ratio
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / SPACING) + 1;
      rows = Math.ceil(height / SPACING) + 1;
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse tracking — listen on window so overlapping content doesn't block events
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Only react when cursor is over the canvas area
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        mouseRef.current = { x, y };
      } else {
        mouseRef.current = { x: -9999, y: -9999 };
      }
    };
    window.addEventListener("mousemove", onMove);

    // ── Animation loop ────────────────────────────────────
    const animate = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Pre-compute displaced dot positions into a flat array
      // Index = row * cols + col, each entry = { x, y }
      const positions = new Float32Array(cols * rows * 2);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const baseX = col * SPACING;
          const baseY = row * SPACING;

          // Ambient drift — slow sine wave based on position + time
          let dx =
            Math.sin(baseX * 0.01 + time * AMBIENT_SPEED) * AMBIENT_AMOUNT;
          let dy =
            Math.cos(baseY * 0.01 + time * AMBIENT_SPEED * 0.7) *
            AMBIENT_AMOUNT;

          // Mouse repulsion — push dots away from cursor
          const distX = baseX + dx - mx;
          const distY = baseY + dy - my;
          const dist = Math.sqrt(distX * distX + distY * distY);
          if (dist < MOUSE_RADIUS && dist > 0) {
            const force = (1 - dist / MOUSE_RADIUS) * MOUSE_PUSH;
            dx += (distX / dist) * force;
            dy += (distY / dist) * force;
          }

          const idx = (row * cols + col) * 2;
          positions[idx] = baseX + dx;
          positions[idx + 1] = baseY + dy;
        }
      }

      // ── Draw lines between neighboring dots ──────────
      ctx.lineWidth = 0.5;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = (row * cols + col) * 2;
          const x1 = positions[idx];
          const y1 = positions[idx + 1];

          // Check right neighbor and bottom neighbor only (avoids duplicates)
          const neighbors = [];
          if (col < cols - 1) neighbors.push((row * cols + col + 1) * 2);
          if (row < rows - 1) neighbors.push(((row + 1) * cols + col) * 2);
          // Diagonal (bottom-right) for richer connections
          if (col < cols - 1 && row < rows - 1)
            neighbors.push(((row + 1) * cols + col + 1) * 2);

          for (const nIdx of neighbors) {
            const x2 = positions[nIdx];
            const y2 = positions[nIdx + 1];
            const ldx = x2 - x1;
            const ldy = y2 - y1;
            const lineDist = Math.sqrt(ldx * ldx + ldy * ldy);

            if (lineDist < LINE_DIST) {
              // Base opacity fades with distance between dots
              let opacity = 0.06 * (1 - lineDist / LINE_DIST);

              // Boost opacity near the mouse
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              const mDist = Math.sqrt(
                (midX - mx) * (midX - mx) + (midY - my) * (midY - my)
              );
              if (mDist < MOUSE_RADIUS) {
                opacity += 0.1 * (1 - mDist / MOUSE_RADIUS);
              }

              ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            }
          }
        }
      }

      // ── Draw dots ────────────────────────────────────
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = (row * cols + col) * 2;
          const x = positions[idx];
          const y = positions[idx + 1];

          // Base opacity for the dot
          let opacity = 0.12;

          // Brighten dots near the mouse
          const dToMouse = Math.sqrt((x - mx) * (x - mx) + (y - my) * (y - my));
          if (dToMouse < MOUSE_RADIUS) {
            opacity += 0.25 * (1 - dToMouse / MOUSE_RADIUS);
          }

          ctx.fillStyle = `rgba(255,255,255,${opacity})`;
          ctx.beginPath();
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Canvas fills the hero section */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Radial gradient mask — constellation fades toward edges */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, var(--color-dark-950) 75%)",
        }}
      />
    </div>
  );
}

// Static fallback for users who prefer reduced motion
function drawStatic(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cols = Math.ceil(width / SPACING) + 1;
  const rows = Math.ceil(height / SPACING) + 1;

  // Draw static dots
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.beginPath();
      ctx.arc(col * SPACING, row * SPACING, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw static lines between neighbors
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 0.5;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * SPACING;
      const y = row * SPACING;
      if (col < cols - 1) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo((col + 1) * SPACING, y);
        ctx.stroke();
      }
      if (row < rows - 1) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, (row + 1) * SPACING);
        ctx.stroke();
      }
    }
  }
}
