"use client";

// Real-time measurement feed — polls every 3 seconds for new measurements
// Shows each measurement with source icons, confidence badge, and tolerance status

import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api-url";
import { useSmartPoll, formatTimeSince } from "@/lib/use-smart-poll";
import {
  Mic,
  Video,
  Camera,
  PenLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface MeasurementSource {
  sourceType: string;
  value: number;
  unit: string;
  confidence: number;
  rawExcerpt: string | null;
}

interface Measurement {
  id: string;
  parameterName: string;
  measurementType: string;
  value: number;
  unit: string;
  confidence: number;
  corroborationLevel: string;
  status: string;
  inTolerance: boolean | null;
  toleranceLow: number | null;
  toleranceHigh: number | null;
  flagReason: string | null;
  sequenceInShift: number | null;
  measuredAt: string;
  updatedAt: string;
  sources: MeasurementSource[];
}

const SOURCE_ICONS: Record<string, typeof Mic> = {
  audio_callout: Mic,
  video_frame: Video,
  photo_gauge: Camera,
  manual_entry: PenLine,
};

const CONFIDENCE_COLORS: Record<string, string> = {
  corroborated: "bg-green-100 text-green-700 border-green-200",
  single: "bg-amber-100 text-amber-700 border-amber-200",
  conflicting: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  confirmed: CheckCircle2,
  pending: Clock,
  flagged: AlertTriangle,
  out_of_tolerance: XCircle,
  overridden: PenLine,
};

export function MeasurementFeed({ sessionId, isActive }: { sessionId: string; isActive: boolean }) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const lastPoll = useRef<string | null>(null);

  const pollMeasurements = useCallback(async () => {
    const params = lastPoll.current ? `?since=${encodeURIComponent(lastPoll.current)}` : "";
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/measurements${params}`));
      const data = await res.json();
      if (data.success) {
        if (lastPoll.current && data.data.length > 0) {
          // Merge new/updated measurements
          setMeasurements((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of data.data) map.set(m.id, m);
            return Array.from(map.values()).sort(
              (a, b) => (a.sequenceInShift || 0) - (b.sequenceInShift || 0)
            );
          });
        } else if (!lastPoll.current) {
          setMeasurements(data.data);
        }
        lastPoll.current = data.polledAt;
      }
    } catch (e) {
      console.error("Poll error:", e);
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    void pollMeasurements();
  }, [pollMeasurements]);

  // Smart polling: starts fast (2s), backs off when quiet, resets on user interaction
  const measurementPoll = useSmartPoll({
    pollFn: pollMeasurements,
    enabled: isActive,
    initialIntervalMs: 2000,
    maxIntervalMs: 30000,
    backoffFactor: 1.5,
    resetKey: measurements.length, // reset to fast when new measurements arrive
  });

  if (measurements.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400">
        <Clock className="mx-auto h-8 w-8 mb-2" />
        <p>No measurements yet</p>
        <p className="text-xs mt-1">Measurements will appear here as they&apos;re captured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Live update indicator */}
      {isActive && (
        <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400 pb-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span>Updated {formatTimeSince(measurementPoll.secondsSinceUpdate)}</span>
        </div>
      )}
      {measurements.map((m) => {
        const isExpanded = expandedId === m.id;
        const confidenceColor = CONFIDENCE_COLORS[m.corroborationLevel] || CONFIDENCE_COLORS.single;
        const StatusIcon = STATUS_ICONS[m.status] || Clock;

        return (
          <div
            key={m.id}
            className="rounded-lg border bg-white p-3 transition-shadow hover:shadow-sm cursor-pointer"
            onClick={() => setExpandedId(isExpanded ? null : m.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Status icon */}
                <StatusIcon
                  className={`h-4 w-4 flex-shrink-0 ${
                    m.status === "confirmed" ? "text-green-500"
                    : m.status === "flagged" || m.status === "out_of_tolerance" ? "text-red-500"
                    : "text-amber-500"
                  }`}
                />

                {/* Parameter name + value */}
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {m.parameterName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-lg font-semibold text-slate-900">
                      {m.value}
                    </span>
                    <span className="text-sm text-slate-500">{m.unit}</span>

                    {/* Tolerance indicator */}
                    {m.inTolerance === false && (
                      <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5">
                        OUT OF TOL
                      </span>
                    )}
                    {m.inTolerance === true && m.toleranceLow !== null && (
                      <span className="text-xs text-slate-400">
                        ({m.toleranceLow}–{m.toleranceHigh})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Source icons */}
                <div className="flex gap-1">
                  {m.sources.map((s, i) => {
                    const Icon = SOURCE_ICONS[s.sourceType] || PenLine;
                    return <Icon key={i} className="h-3.5 w-3.5 text-slate-400" />;
                  })}
                </div>

                {/* Confidence badge */}
                <span className={`text-xs rounded-full px-2 py-0.5 border ${confidenceColor}`}>
                  {m.corroborationLevel}
                </span>

                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </div>

            {/* Expanded source details */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t space-y-2">
                {m.sources.map((s, i) => {
                  const Icon = SOURCE_ICONS[s.sourceType] || PenLine;
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">{s.sourceType.replace("_", " ")}</span>
                        <span className="mx-1">·</span>
                        <span>{s.value} {s.unit}</span>
                        <span className="mx-1">·</span>
                        <span className="text-slate-400">{Math.round(s.confidence * 100)}% confidence</span>
                        {s.rawExcerpt && (
                          <p className="text-slate-400 mt-0.5 italic">&ldquo;{s.rawExcerpt}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {m.flagReason && (
                  <p className="text-xs text-red-600 mt-1">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    {m.flagReason}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
