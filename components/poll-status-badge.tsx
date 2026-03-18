"use client";

// Small badge that shows "Last updated X ago" so the user knows data is fresh.
// Also shows a manual refresh button and a subtle indicator of the polling speed.

import { RefreshCw } from "lucide-react";
import { formatTimeSince, type SmartPollState } from "@/lib/use-smart-poll";

interface PollStatusBadgeProps {
  poll: SmartPollState;
  // Whether we're actively polling (not in a terminal state)
  isPolling: boolean;
  className?: string;
}

export function PollStatusBadge({ poll, isPolling, className = "" }: PollStatusBadgeProps) {
  if (!isPolling) return null;

  const label = formatTimeSince(poll.secondsSinceUpdate);

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs text-slate-500 ${className}`}
    >
      {/* Pulsing dot to show we're live-updating */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>

      <span>Updated {label}</span>

      {/* Manual refresh button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          poll.pollNow();
        }}
        className="ml-0.5 p-0.5 rounded hover:bg-slate-100 transition-colors"
        title="Refresh now"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}
