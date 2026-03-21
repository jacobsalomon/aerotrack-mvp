"use client";

// Horizontal scrollable section tab bar for inspection workspace
// Each tab shows figure number, short title, completion badge, and status dot

import { useRef } from "react";
import { cn } from "@/lib/utils";

interface SectionProgressData {
  id: string;
  title: string;
  figureNumber: string;
  total: number;
  done: number;
  problem: number;
  skipped: number;
  findings: number;
  sectionStatus: "not_started" | "in_progress" | "complete" | "has_problems";
}

interface SectionData {
  id: string;
  title: string;
  figureNumber: string;
  sortOrder: number;
  referenceImageUrls: string[];
  itemCount: number;
  configurationApplicability: string[];
}

interface Props {
  sections: SectionData[];
  sectionProgress: SectionProgressData[];
  activeSectionId: string;
  onSectionChange: (sectionId: string) => void;
  configVariant: string | null;
}

const statusDotColors = {
  not_started: "bg-zinc-600",
  in_progress: "bg-blue-500",
  complete: "bg-green-500",
  has_problems: "bg-red-500",
};

export default function SectionTabs({ sections, sectionProgress, activeSectionId, onSectionChange, configVariant }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build progress lookup
  const progressLookup = new Map(sectionProgress.map((sp) => [sp.id, sp]));

  // Filter sections by config variant
  const visibleSections = sections.filter((s) => {
    if (!configVariant) return true;
    if (s.configurationApplicability.length === 0) return true;
    return s.configurationApplicability.includes(configVariant);
  });

  return (
    <div className="bg-zinc-900/50 border-b border-white/10">
      <div ref={scrollRef} className="flex overflow-x-auto scrollbar-hide gap-1 px-2 py-2">
        {visibleSections.map((section) => {
          const progress = progressLookup.get(section.id);
          const isActive = section.id === activeSectionId;
          const done = progress?.done ?? 0;
          const total = progress?.total ?? section.itemCount;
          const status = progress?.sectionStatus ?? "not_started";

          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={cn(
                "flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg transition-colors min-h-[60px]",
                isActive
                  ? "bg-white/10 border border-white/20"
                  : "bg-transparent border border-transparent hover:bg-white/5"
              )}
            >
              {/* Status dot */}
              <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", statusDotColors[status])} />

              {/* Section info */}
              <div className="text-left min-w-0">
                <p className={cn("text-sm font-medium truncate", isActive ? "text-white" : "text-white/60")}>
                  Fig {section.figureNumber}
                </p>
                <p className="text-xs text-white/40 truncate max-w-[120px]">
                  {section.title}
                </p>
              </div>

              {/* Completion badge */}
              <span className={cn(
                "text-xs font-mono flex-shrink-0 px-1.5 py-0.5 rounded",
                isActive ? "bg-white/10 text-white/80" : "text-white/40"
              )}>
                {done}/{total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
