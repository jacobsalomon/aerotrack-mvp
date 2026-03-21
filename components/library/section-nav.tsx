"use client";

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";

interface SectionInfo {
  id: string;
  title: string;
  figureNumber: string;
  status: string;
  itemCount: number;
  extractionConfidence: number;
}

interface SectionNavProps {
  sections: SectionInfo[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
}

function statusIcon(status: string, confidence: number) {
  switch (status) {
    case "extracted":
    case "reviewed":
      if (confidence < 0.7) {
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      }
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "extracting":
      return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />;
  }
}

export default function SectionNav({
  sections,
  activeSectionId,
  onSelectSection,
}: SectionNavProps) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Sub-Assemblies
      </p>
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => onSelectSection(section.id)}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm",
            activeSectionId === section.id
              ? "bg-indigo-50 text-indigo-900"
              : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {statusIcon(section.status, section.extractionConfidence)}
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate text-xs">
              Fig. {section.figureNumber}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {section.title}
            </p>
          </div>
          <span className="text-[10px] text-slate-400 shrink-0">
            {section.itemCount}
          </span>
        </button>
      ))}
    </div>
  );
}
