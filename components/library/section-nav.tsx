"use client";

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  XCircle,
} from "lucide-react";

interface SectionItemInfo {
  confidence: number;
  reviewReason: string | null;
}

interface SectionInfo {
  id: string;
  title: string;
  figureNumber: string;
  status: string;
  itemCount: number;
  extractionConfidence: number;
  items: SectionItemInfo[];
}

interface SectionNavProps {
  sections: SectionInfo[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
}

// Count items that need review in a section
function flaggedCount(items: SectionItemInfo[]): number {
  return items.filter((i) => i.reviewReason || i.confidence < 0.7).length;
}

function statusIcon(status: string, items: SectionItemInfo[]) {
  switch (status) {
    case "extracted":
    case "reviewed":
      if (flaggedCount(items) > 0) {
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
      {/* Full Document — browse the entire PDF in page order */}
      <button
        onClick={() => onSelectSection("__full__")}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm mb-1",
          activeSectionId === "__full__"
            ? "bg-indigo-50 text-indigo-900"
            : "text-slate-600 hover:bg-slate-50"
        )}
      >
        <FileText className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-medium text-xs">Full Document</span>
      </button>

      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        {sections.every((s) => s.figureNumber.startsWith("DOC-"))
          ? "Sections"
          : "Sub-Assemblies"}
      </p>
      {sections.map((section) => {
        const flagged = flaggedCount(section.items);
        const isDocSection = section.figureNumber.startsWith("DOC-");
        return (
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
            {statusIcon(section.status, section.items)}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-xs">
                {isDocSection
                  ? `Section ${section.figureNumber.replace("DOC-", "")}`
                  : `Fig. ${section.figureNumber}`}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {section.title}
              </p>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">
              {section.itemCount}
              {flagged > 0 && (
                <span className="text-amber-500 ml-0.5">
                  {" "}· {flagged}⚠
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
