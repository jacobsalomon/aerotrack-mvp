// ══════════════════════════════════════════════════════════════════════
// SHARED FORM HELPERS
// Reusable building blocks for rendering FAA form previews.
// Used by Form8130 (glasses demo), Form337Preview, and Form8010Preview.
// ══════════════════════════════════════════════════════════════════════

import React from "react";

// CSS keyframe for the staggered row-reveal animation used by all forms.
// Inject this via a <style> tag in any page that renders animated forms.
export const FORM_ROW_KEYFRAME = `
  @keyframes formRowIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// ── FormCell ────────────────────────────────────────────────────────
// A single labelled field inside a form row. Shows the field name
// at the top in small caps, the value below, and optionally a small
// annotation showing where the data came from (e.g., "← QR SCAN").
export function FormCell({
  label,
  value,
  source,
  highlight = false,
  className = "",
}: {
  label: string;
  value: string;
  source?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`border-r border-slate-200 last:border-r-0 px-2.5 py-1.5 ${className}`}>
      <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider leading-tight">
        {label}
      </p>
      <p
        className={`mt-0.5 leading-snug whitespace-pre-line text-xs ${
          highlight ? "text-blue-800 font-bold font-mono" : "text-slate-800"
        }`}
      >
        {value}
      </p>
      {source && (
        <p className="text-[8px] text-blue-500 mt-0.5 italic">← {source}</p>
      )}
    </div>
  );
}

// ── FormRow ─────────────────────────────────────────────────────────
// Wraps a row of cells and applies the stagger animation when
// `animate` is true. Each row gets a delay so they appear one-by-one.
export function FormRow({
  children,
  delay,
  animate,
}: {
  children: React.ReactNode;
  delay: number;
  animate: boolean;
}) {
  return (
    <div
      className="border-b border-slate-200 last:border-b-0"
      style={
        animate
          ? {
              animation: "formRowIn 0.4s ease forwards",
              animationDelay: `${delay}ms`,
              opacity: 0,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
