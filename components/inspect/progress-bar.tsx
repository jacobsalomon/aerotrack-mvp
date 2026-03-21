"use client";

// Sticky progress bar at top of inspection workspace
// Shows: completion percentage, item counts, problems, config variant, review button

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ClipboardCheck, Eye, Lock } from "lucide-react";

interface Props {
  summary: {
    total: number;
    done: number;
    problem: number;
    skipped: number;
    pending: number;
    findings: number;
  };
  configVariant: string | null;
  workOrderRef: string | null;
  templateTitle: string;
  componentInfo: { partNumber: string; serialNumber: string; description: string } | null;
  isReadOnly: boolean;
  unassignedCount: number;
  onReview: () => void;
}

export default function ProgressBar({
  summary,
  configVariant,
  workOrderRef,
  templateTitle,
  componentInfo,
  isReadOnly,
  unassignedCount,
  onReview,
}: Props) {
  const completedCount = summary.done + summary.skipped;
  const pct = summary.total > 0 ? Math.round((completedCount / summary.total) * 100) : 0;

  return (
    <div className="sticky top-0 z-20 bg-zinc-900 border-b border-white/10 px-4 py-3">
      {/* Top row: component info + template */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          {componentInfo && (
            <span className="text-white/70 text-sm truncate">
              {componentInfo.description} · P/N: {componentInfo.partNumber} · S/N: {componentInfo.serialNumber}
            </span>
          )}
          <span className="text-white/40 text-xs truncate hidden sm:inline">
            {templateTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isReadOnly && (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 text-xs">
              <Lock className="h-3 w-3 mr-1" /> Signed Off
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={onReview} className="border-white/20 text-white/70 hover:text-white">
            <Eye className="h-4 w-4 mr-1" /> Review
          </Button>
        </div>
      </div>

      {/* Progress row */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Progress value={pct} className="h-2 bg-white/10" />
        </div>
        <div className="flex items-center gap-3 text-sm flex-shrink-0">
          <span className="text-white font-medium">
            {completedCount} / {summary.total}
            <span className="text-white/40 ml-1">({pct}%)</span>
          </span>
          {summary.problem > 0 && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {summary.problem + summary.findings} problems
            </span>
          )}
          {configVariant && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs">
              {configVariant}
            </Badge>
          )}
          {workOrderRef && (
            <span className="text-white/30 text-xs">{workOrderRef}</span>
          )}
          {unassignedCount > 0 && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-300 text-xs animate-pulse">
              {unassignedCount} unassigned
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
