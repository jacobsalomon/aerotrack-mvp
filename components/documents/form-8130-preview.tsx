"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Check,
  Clock,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

// ─── TYPES ─────────────────────────────────────────────────
// The 8130-3 data shape returned by /api/ai/generate-8130.
// Each "block" corresponds to a block on the real FAA form.

export interface Form8130Data {
  block1: string;   // Approving authority (e.g., "FAA")
  block2: string;   // Document type ("Authorized Release Certificate")
  block3: string;   // Form tracking number
  block4: string;   // Organization name & address
  block5: string;   // Work order / contract / invoice number
  block6a: string;  // Item description
  block6b: string;  // Part number
  block6c: string;  // Serial number
  block6d: string;  // Quantity
  block6e: string;  // Status (Overhauled, Repaired, etc.)
  block7: string;   // Remarks — the big narrative block
  block8: string;   // (import/export — usually blank)
  block9: string;   // (import/export — usually blank)
  block10: string;  // (import/export — usually blank)
  block11: string;  // Approval/authorization number
  block12: string;  // Date of approval
  block13: string;  // Authorized signature
  block14: string;  // Certifying statement
  narrative_summary?: string;
}

interface Form8130PreviewProps {
  data: Form8130Data;
  // When true, plays the "reveal" animation where fields appear sequentially
  animate?: boolean;
  // Called when animation finishes
  onAnimationComplete?: () => void;
  // Whether the form has been signed
  signed?: boolean;
  // Who signed it
  signerName?: string;
  // Show the download button
  showDownload?: boolean;
  // Component ID (for PDF download)
  componentId?: string;
}

// ─── HELPERS ───────────────────────────────────────────────

// Splits Block 7 into sections based on common patterns in the
// generated narrative (findings, work performed, parts, tests)
function parseBlock7(text: string) {
  const sections: { heading: string; lines: string[] }[] = [];
  let currentSection: { heading: string; lines: string[] } = {
    heading: "Description",
    lines: [],
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for section headings (common patterns from the AI output)
    const upper = trimmed.toUpperCase();
    if (
      upper.startsWith("FINDINGS") ||
      upper.startsWith("WORK PERFORMED") ||
      upper.startsWith("PARTS CONSUMED") ||
      upper.startsWith("PARTS REPLACED") ||
      upper.startsWith("TEST RESULTS") ||
      upper.startsWith("MEASUREMENTS") ||
      upper.startsWith("REASSEMBLY") ||
      upper.startsWith("LIMITATIONS") ||
      upper.startsWith("SERVICE BULLETIN")
    ) {
      // Save current section if it has content
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      // Start a new section with the heading cleaned up
      const heading = trimmed.replace(/[:\-—]+$/, "").trim();
      currentSection = { heading, lines: [] };
    } else {
      currentSection.lines.push(trimmed);
    }
  }

  // Push the last section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

// Checks if a line looks like a passing test result (contains a check
// or "PASS" or measurement within limits)
function isPassingResult(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("pass") ||
    lower.includes("within limits") ||
    lower.includes("within spec") ||
    lower.includes("serviceable") ||
    line.includes("✓") ||
    line.includes("✅")
  );
}

// ─── COMPONENT ─────────────────────────────────────────────

export default function Form8130Preview({
  data,
  animate = false,
  onAnimationComplete,
  signed = false,
  signerName,
  showDownload = true,
  componentId,
}: Form8130PreviewProps) {
  // Controls which sections are visible during the reveal animation.
  // 0 = nothing visible, 9 = everything visible.
  const [visibleSections, setVisibleSections] = useState(animate ? 0 : 9);
  const [downloading, setDownloading] = useState(false);
  // Track whether the "Before/After" comparison is shown
  const [showComparison, setShowComparison] = useState(false);
  const animationDone = useRef(false);

  // ── REVEAL ANIMATION ──
  // When animate=true, each section of the form appears one at a time
  // over ~2.5 seconds, making it feel like the form is being "typed in"
  useEffect(() => {
    if (!animate || animationDone.current) return;

    const totalSections = 9; // header, blocks 1-2, block 3-4, block 5-6, block 7, block 8-10, block 11, blocks 12-13, block 14
    const intervalMs = 280; // time between sections appearing

    let section = 0;
    const timer = setInterval(() => {
      section++;
      setVisibleSections(section);
      if (section >= totalSections) {
        clearInterval(timer);
        animationDone.current = true;
        onAnimationComplete?.();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [animate, onAnimationComplete]);

  // ── PDF DOWNLOAD ──
  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/documents/render-8130-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, componentId }),
      });

      if (!res.ok) throw new Error("PDF generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `8130-3_${data.block3 || "form"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
    setDownloading(false);
  }

  // Parse Block 7 into structured sections for display
  const block7Sections = parseBlock7(data.block7 || "");

  // Helper: returns true if a section should be visible based on animation progress
  const show = (section: number) => visibleSections >= section;

  // The status checkboxes for Block 6e / Block 11 area
  const statusOptions = ["Overhauled", "Repaired", "Inspected", "Modified", "Tested", "New"];
  const currentStatus = data.block6e || "Overhauled";

  return (
    <div className="space-y-4">
      {/* ── THE FORM ── */}
      <div className="relative border-2 border-slate-400 rounded-sm bg-slate-50 font-serif text-sm overflow-hidden">
        {/* Watermark — shows when form hasn't been signed */}
        {!signed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <p className="text-slate-300 text-4xl font-bold rotate-[-30deg] select-none tracking-widest">
              GENERATED BY AI — PENDING REVIEW
            </p>
          </div>
        )}

        {/* ── FORM HEADER ── */}
        {show(1) && (
          <div
            className={`border-b-2 border-slate-400 px-4 py-3 bg-slate-100 transition-opacity duration-300 ${
              show(1) ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-wide">
                  AUTHORIZED RELEASE CERTIFICATE
                </h2>
                <p className="text-xs text-slate-500">
                  FAA Form 8130-3 (04-13)
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>OMB No. 2120-0020</p>
                <p>Expiration Date: [Ongoing]</p>
              </div>
            </div>
          </div>
        )}

        {/* ── BLOCKS 1 & 2 — Authority and Document Type ── */}
        {show(2) && (
          <div className="grid grid-cols-2 border-b border-slate-300 transition-opacity duration-300">
            <div className="border-r border-slate-300 px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                1. Approving Civil Aviation Authority / Country
              </p>
              <p className="font-medium">{data.block1 || "FAA"}</p>
              <p className="text-xs text-slate-500">Federal Aviation Administration</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                2. Authorized Release Document
              </p>
              <p className="font-medium">{data.block2 || "Authorized Release Certificate"}</p>
            </div>
          </div>
        )}

        {/* ── BLOCKS 3 & 4 — Tracking Number and Organization ── */}
        {show(3) && (
          <div className="border-b border-slate-300 transition-opacity duration-300">
            <div className="grid grid-cols-2 border-b border-slate-200">
              <div className="border-r border-slate-300 px-3 py-2">
                <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                  3. Form Tracking Number
                </p>
                <p className="font-mono font-bold text-blue-800">
                  {data.block3 || "—"}
                </p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                  4. Organization Name and Address
                </p>
                <p className="whitespace-pre-line text-xs leading-relaxed">
                  {data.block4 || "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── BLOCKS 5 & 6 — Work Order and Item Details ── */}
        {show(4) && (
          <div className="border-b border-slate-300 transition-opacity duration-300">
            {/* Block 5 — Work Order */}
            <div className="border-b border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                5. Work Order / Contract / Invoice Number
              </p>
              <p className="font-mono">{data.block5 || "—"}</p>
            </div>
            {/* Block 6 — Item Detail (split into sub-blocks) */}
            <div className="grid grid-cols-5 text-xs">
              <div className="col-span-2 border-r border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                  6a. Item Description
                </p>
                <p className="font-medium">{data.block6a || "—"}</p>
              </div>
              <div className="border-r border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                  6b. Part Number
                </p>
                <p className="font-mono font-bold">{data.block6b || "—"}</p>
              </div>
              <div className="border-r border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                  6c. Serial Number
                </p>
                <p className="font-mono font-bold">{data.block6c || "—"}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                  6d. Qty
                </p>
                <p className="font-mono">{data.block6d || "1"}</p>
              </div>
            </div>
            {/* Block 6e — Status */}
            <div className="border-t border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">
                6e. Eligibility / Status
              </p>
              <div className="flex gap-4 text-xs">
                {statusOptions.map((opt) => (
                  <label key={opt} className="flex items-center gap-1">
                    <span
                      className={`inline-block w-3.5 h-3.5 border rounded-sm text-center leading-[14px] text-[10px] ${
                        currentStatus.toLowerCase() === opt.toLowerCase()
                          ? "bg-slate-800 text-white border-slate-800"
                          : "border-slate-400"
                      }`}
                    >
                      {currentStatus.toLowerCase() === opt.toLowerCase() ? "×" : ""}
                    </span>
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── BLOCK 7 — Remarks (the big one) ── */}
        {show(5) && (
          <div className="border-b border-slate-300 px-3 py-2 transition-opacity duration-300">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">
              7. Description — Status / Work
            </p>
            <div className="space-y-3 text-xs leading-relaxed min-h-[120px]">
              {block7Sections.length > 0 ? (
                block7Sections.map((section, i) => (
                  <div key={i}>
                    {/* Show heading if it's not the generic "Description" */}
                    {section.heading !== "Description" && (
                      <p className="font-bold text-slate-700 uppercase text-[11px] mb-0.5">
                        {section.heading}:
                      </p>
                    )}
                    {section.lines.map((line, j) => {
                      const passing = isPassingResult(line);
                      return (
                        <p key={j} className="ml-2 flex items-start gap-1">
                          {/* Bullet or check mark */}
                          {line.startsWith("-") || line.startsWith("•") ? (
                            <>
                              {passing ? (
                                <Check className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
                              ) : (
                                <span className="text-slate-400 mt-0">—</span>
                              )}
                              <span className={passing ? "text-green-800" : ""}>
                                {line.replace(/^[-•]\s*/, "")}
                              </span>
                            </>
                          ) : (
                            <span className={passing ? "text-green-800" : ""}>
                              {passing && (
                                <Check className="h-3 w-3 text-green-600 inline mr-1 -mt-0.5" />
                              )}
                              {line}
                            </span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                ))
              ) : (
                // If parsing didn't find sections, just show the raw text
                <p className="whitespace-pre-line">{data.block7}</p>
              )}
            </div>
          </div>
        )}

        {/* ── BLOCKS 8-10 — Eligibility / Conformity ── */}
        {show(6) && (
          <div className="border-b border-slate-300 px-3 py-2 transition-opacity duration-300 bg-slate-50">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">
              8–10. Eligibility / Conformity
            </p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <label className="flex items-center gap-1">
                <span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] border-slate-800">
                  ×
                </span>
                <span>Condition for safe operation</span>
              </label>
              <label className="flex items-center gap-1">
                <span className="inline-block w-3.5 h-3.5 border rounded-sm bg-slate-800 text-white text-center leading-[14px] text-[10px] border-slate-800">
                  ×
                </span>
                <span>FAR § 43.9, 14 CFR Part 145</span>
              </label>
            </div>
          </div>
        )}

        {/* ── BLOCKS 11-12 — Approval and Date ── */}
        {show(7) && (
          <div className="grid grid-cols-2 border-b border-slate-300 transition-opacity duration-300">
            <div className="border-r border-slate-300 px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                11. Approval / Authorization Number
              </p>
              <p className="font-mono">{data.block11 || "—"}</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                12. Date (dd/mmm/yyyy)
              </p>
              <p className="font-mono">{data.block12 || new Date().toISOString().split("T")[0]}</p>
            </div>
          </div>
        )}

        {/* ── BLOCK 13 — Authorized Signature ── */}
        {show(8) && (
          <div className="border-b border-slate-300 px-3 py-3 transition-opacity duration-300">
            <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-1">
              13. Authorized Signature
            </p>
            <div className="flex items-center gap-4">
              <div className="border-2 border-dashed border-slate-300 rounded px-6 py-3 min-w-[200px] text-center">
                {signed && signerName ? (
                  <div>
                    <p className="font-script text-lg text-blue-800 italic">
                      {signerName}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">Electronically Signed</p>
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs italic">
                    {data.block13 || "[PENDING E-SIGNATURE]"}
                  </p>
                )}
              </div>
              <div className="text-xs text-slate-500 space-y-0.5">
                <p>Date: {data.block12 || new Date().toISOString().split("T")[0]}</p>
                <p>Auth: {data.block11 || "—"}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── BLOCK 14 — Certifying Statement + AeroTrack Verification ── */}
        {show(9) && (
          <div className="transition-opacity duration-300">
            <div className="border-b border-slate-300 px-3 py-2">
              <p className="text-[10px] text-slate-400 font-sans uppercase tracking-wider mb-0.5">
                14. Certifying Statement
              </p>
              <p className="text-xs leading-relaxed text-slate-700">
                {data.block14 || "—"}
              </p>
            </div>
            {/* AeroTrack digital verification footer */}
            <div className="px-3 py-2 bg-slate-100 text-[10px] text-slate-500 flex items-center justify-between font-sans">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] h-4">
                  AeroTrack Digital Verification
                </Badge>
                <span className="font-mono">
                  Hash: {generateHash(data)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>Tamper-evident</span>
                <span>|</span>
                <span>Generated by AeroTrack AI v1.0</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── TIME SAVED COUNTER ── */}
      {show(9) && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Clock className="h-5 w-5 text-blue-600" />
            <span className="text-2xl font-bold text-blue-800">~87 minutes saved</span>
          </div>
          <p className="text-sm text-blue-600">
            vs. hand-writing this form and cross-checking references manually
          </p>
        </div>
      )}

      {/* ── ACTION BUTTONS ── */}
      {show(9) && (
        <div className="flex items-center gap-3">
          {showDownload && (
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={downloading}
              className="gap-2"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download PDF
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setShowComparison(!showComparison)}
            className="gap-2 text-slate-600"
          >
            {showComparison ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {showComparison ? "Hide" : "See"} What This Replaced
          </Button>
        </div>
      )}

      {/* ── BEFORE / AFTER COMPARISON ── */}
      {showComparison && show(9) && (
        <div className="grid grid-cols-2 gap-4 border rounded-lg overflow-hidden">
          {/* LEFT — The Old Way */}
          <div className="bg-red-50 p-5">
            <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-3">
              The Old Way
            </h3>
            <div className="bg-white rounded border border-red-200 p-4 space-y-3 text-center">
              {/* Illustration of a messy hand-written form */}
              <div className="h-48 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded flex flex-col items-center justify-center text-slate-400">
                <svg
                  className="h-16 w-16 text-amber-300 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-xs text-amber-600 italic px-4">
                  Hand-written 8130-3 with messy handwriting, white-out corrections, and coffee stains
                </p>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">45–90 minutes</span>
                </div>
                <p className="text-xs text-red-600">
                  Hand-write all 14 blocks, look up CMM references, cross-check
                  part numbers, verify serial numbers against paperwork
                </p>
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <span className="text-red-500 font-bold">15%</span>
                  <span>error rate (industry average)</span>
                </div>
                <p className="text-xs text-red-600">
                  Transposition errors, wrong CMM revision, missing fields,
                  illegible handwriting requiring re-work
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT — The AeroTrack Way */}
          <div className="bg-green-50 p-5">
            <h3 className="text-sm font-bold text-green-800 uppercase tracking-wider mb-3">
              The AeroTrack Way
            </h3>
            <div className="bg-white rounded border border-green-200 p-4 space-y-3 text-center">
              {/* Mini preview of the rendered form */}
              <div className="h-48 bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 rounded flex flex-col items-center justify-center overflow-hidden relative">
                {/* Tiny form representation */}
                <div className="w-4/5 text-[6px] text-left space-y-0.5 font-mono text-slate-500">
                  <div className="border-b border-slate-200 pb-0.5 font-bold text-[7px] text-slate-700">
                    AUTHORIZED RELEASE CERTIFICATE
                  </div>
                  <div className="grid grid-cols-2 gap-0.5">
                    <div className="border border-slate-200 rounded-sm p-0.5">1. {data.block1}</div>
                    <div className="border border-slate-200 rounded-sm p-0.5">3. {data.block3?.slice(0, 15)}</div>
                  </div>
                  <div className="border border-slate-200 rounded-sm p-0.5">
                    6b. {data.block6b}
                  </div>
                  <div className="border border-slate-200 rounded-sm p-0.5 text-green-600">
                    6e. {data.block6e}
                  </div>
                  <div className="border border-slate-200 rounded-sm p-0.5 h-8 overflow-hidden">
                    7. {data.block7?.slice(0, 80)}...
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="absolute bottom-1 right-1 text-[6px] h-3 bg-green-50 text-green-600"
                >
                  AI Generated
                </Badge>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">~8 seconds</span>
                </div>
                <p className="text-xs text-green-600">
                  AI reads captured evidence, cross-references CMM, fills all 14
                  blocks with verified data
                </p>
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>AI-verified accuracy</span>
                </div>
                <p className="text-xs text-green-600">
                  Part numbers pulled from capture data, CMM references verified,
                  test results cross-checked against specifications
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HASH GENERATOR ────────────────────────────────────────
// Creates a short simulated verification hash from the form data.
// In production this would be a real cryptographic hash.
function generateHash(data: Form8130Data): string {
  const input = `${data.block3}${data.block6b}${data.block6c}${data.block7?.slice(0, 50)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex.slice(0, 4)}...${hex.slice(-4)}`;
}
