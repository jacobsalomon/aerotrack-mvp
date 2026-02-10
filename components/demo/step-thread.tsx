// ══════════════════════════════════════════════════════════════════════
// STEP 4: THE DIGITAL THREAD — Animated Side-by-Side Timelines
//
// Shows two component lifecycles as animated vertical timelines.
// Component A ("The Perfect History") has a clean, unbroken record.
// Component B ("The Gap") has a dramatic 14-month documentation hole.
//
// Fetches real data from the API when the step becomes active.
// Falls back to a static layout if the API is unavailable.
//
// Each event node is clickable — expanding to show full details
// including evidence counts, generated documents, and SHA-256 hash.
// ══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ExternalLink,
  AlertTriangle,
  Factory,
  Plane,
  Wrench,
  ClipboardCheck,
  TestTube,
  PackageCheck,
  ArrowRightLeft,
  ChevronDown,
  Camera,
  Mic,
  FileText,
  Hash,
} from "lucide-react";

// ─── TYPES ───────────────────────────────────────────────────

interface Evidence {
  id: string;
  type: string;
}

interface GeneratedDoc {
  id: string;
  docType: string;
  title: string;
}

interface LifecycleEvent {
  id: string;
  eventType: string;
  date: string;
  facility: string;
  facilityType: string;
  facilityCert?: string | null;
  performer: string;
  performerCert?: string | null;
  description: string;
  hoursAtEvent?: number | null;
  cyclesAtEvent?: number | null;
  aircraft?: string | null;
  operator?: string | null;
  workOrderRef?: string | null;
  cmmReference?: string | null;
  notes?: string | null;
  hash?: string | null;
  evidence: Evidence[];
  generatedDocs: GeneratedDoc[];
}

interface ComponentData {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  events: LifecycleEvent[];
}

// ─── EVENT TYPE ICONS ────────────────────────────────────────

function eventTypeIcon(type: string) {
  switch (type) {
    case "manufacture": return Factory;
    case "install": return Plane;
    case "remove": return ArrowRightLeft;
    case "repair": return Wrench;
    case "detailed_inspection":
    case "receiving_inspection": return ClipboardCheck;
    case "functional_test": return TestTube;
    case "release_to_service": return PackageCheck;
    case "teardown": return Wrench;
    case "transfer": return ArrowRightLeft;
    default: return FileText;
  }
}

// Format event type for display (e.g., "receiving_inspection" → "Receiving Inspection")
function formatEventType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── GAP DETECTION ───────────────────────────────────────────

// Check if the gap between two dates exceeds a threshold (in days)
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

// ─── EVIDENCE SUMMARY ───────────────────────────────────────

function evidenceSummary(evidence: Evidence[]): string {
  if (evidence.length === 0) return "";
  const counts: Record<string, number> = {};
  evidence.forEach((e) => {
    counts[e.type] = (counts[e.type] || 0) + 1;
  });
  const labels: Record<string, string> = {
    photo: "photos",
    video: "videos",
    voice_note: "voice notes",
    document_scan: "doc scans",
    measurement: "measurements",
  };
  return Object.entries(counts)
    .map(([type, count]) => `${count} ${labels[type] || type}`)
    .join(" · ");
}

// ─── MAIN COMPONENT ─────────────────────────────────────────

interface StepThreadProps {
  active: boolean;
}

export default function StepThread({ active }: StepThreadProps) {
  const [cleanComp, setCleanComp] = useState<ComponentData | null>(null);
  const [gappedComp, setGappedComp] = useState<ComponentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Fetch data from API when step becomes active
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Step 1: Get component IDs by serial number
      const listRes = await fetch("/api/components");
      const allComponents = await listRes.json();
      const clean = allComponents.find(
        (c: { serialNumber: string }) => c.serialNumber === "SN-2019-07842"
      );
      const gapped = allComponents.find(
        (c: { serialNumber: string }) => c.serialNumber === "SN-2018-06231"
      );

      if (!clean || !gapped) {
        setError(true);
        setLoading(false);
        return;
      }

      // Step 2: Fetch full component data with events
      const [cleanRes, gappedRes] = await Promise.all([
        fetch(`/api/components/${clean.id}`),
        fetch(`/api/components/${gapped.id}`),
      ]);

      const cleanData = await cleanRes.json();
      const gappedData = await gappedRes.json();

      setCleanComp(cleanData);
      setGappedComp(gappedData);

      // Start animation after a short delay
      setTimeout(() => setAnimateIn(true), 100);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active && !cleanComp && !loading) {
      fetchData();
    }
  }, [active, cleanComp, loading, fetchData]);

  // Toggle event expansion (only one at a time)
  function toggleEvent(eventId: string) {
    setExpandedEvent((prev) => (prev === eventId ? null : eventId));
  }

  // ── LOADING STATE ──
  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-16">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium text-slate-700">Loading component histories...</p>
            <p className="text-sm text-slate-500">Fetching lifecycle events from database</p>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER ──
  return (
    <div className="h-full overflow-y-auto p-6">
      {/* CSS keyframe for timeline event animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes timelineIn {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}} />

      {/* Narration card */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-5 w-5 text-indigo-600" />
            <h3 className="font-bold text-indigo-900">The Digital Thread</h3>
          </div>
          <p className="text-sm text-indigo-700">
            Every component has a &ldquo;digital thread&rdquo; — a complete record of everywhere
            it&apos;s been and everything that&apos;s happened to it. Watch these two
            stories unfold side by side — one perfect, one broken.
          </p>
        </div>
      </div>

      {/* ── SIDE-BY-SIDE TIMELINES ── */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Component A: The Perfect History */}
        <TimelineColumn
          component={cleanComp}
          title="The Perfect History"
          traceScore={94}
          traceColor="green"
          borderColor="border-green-200"
          lineColor="bg-green-400"
          dotColor="bg-green-500"
          animateIn={animateIn}
          expandedEvent={expandedEvent}
          onToggleEvent={toggleEvent}
          error={error}
        />

        {/* Component B: The Gap */}
        <TimelineColumn
          component={gappedComp}
          title="The Gap"
          traceScore={67}
          traceColor="red"
          borderColor="border-red-200"
          lineColor="bg-red-300"
          dotColor="bg-red-500"
          animateIn={animateIn}
          expandedEvent={expandedEvent}
          onToggleEvent={toggleEvent}
          showGaps={true}
          error={error}
        />
      </div>

      {/* ── INSIGHT BOX ── */}
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-slate-50 border rounded-lg p-5 text-center">
          <p className="text-sm text-slate-600 mb-2">
            <strong>FAA data:</strong> ~520,000 suspected unapproved parts enter aircraft
            annually — most through documentation gaps like Component B.
          </p>
          <p className="text-sm text-slate-800 font-medium">
            AeroTrack captures everything automatically — gaps become impossible.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE COLUMN — Renders one component's lifecycle as a
// vertical timeline with animated event nodes.
// ═══════════════════════════════════════════════════════════════

interface TimelineColumnProps {
  component: ComponentData | null;
  title: string;
  traceScore: number;
  traceColor: "green" | "red";
  borderColor: string;
  lineColor: string;
  dotColor: string;
  animateIn: boolean;
  expandedEvent: string | null;
  onToggleEvent: (id: string) => void;
  showGaps?: boolean;
  error?: boolean;
}

function TimelineColumn({
  component,
  title,
  traceScore,
  traceColor,
  borderColor,
  lineColor,
  dotColor,
  animateIn,
  expandedEvent,
  onToggleEvent,
  showGaps = false,
  error = false,
}: TimelineColumnProps) {
  // Fallback if no data
  if (!component && !error) {
    return (
      <Card className={`border-2 ${borderColor}`}>
        <CardContent className="pt-6 text-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  // Error fallback — show a simplified static card
  if (error || !component) {
    return (
      <Card className={`border-2 ${borderColor}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-3 h-3 rounded-full ${dotColor}`} />
            <h4 className={`font-bold text-${traceColor}-800`}>{title}</h4>
          </div>
          <p className="text-sm text-slate-500">
            Unable to load component data. Check the database connection.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort events by date
  const events = [...component.events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Build timeline items (events + gaps)
  const timelineItems: Array<
    | { type: "event"; event: LifecycleEvent; index: number }
    | { type: "gap"; days: number; fromDate: string; toDate: string }
  > = [];

  events.forEach((event, i) => {
    // Check for gap before this event
    if (showGaps && i > 0) {
      const gap = daysBetween(events[i - 1].date, event.date);
      if (gap > 180) {
        const months = Math.round(gap / 30);
        timelineItems.push({
          type: "gap",
          days: gap,
          fromDate: events[i - 1].date,
          toDate: event.date,
        });
      }
    }
    timelineItems.push({ type: "event", event, index: i });
  });

  const scoreBg = traceColor === "green" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";

  return (
    <div>
      {/* ── HEADER ── */}
      <div className={`border-2 ${borderColor} rounded-lg p-4 mb-4`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${dotColor}`} />
            <h4 className={`font-bold text-${traceColor === "green" ? "green" : "red"}-800`}>
              {title}
            </h4>
          </div>
          <Badge className={`${scoreBg} text-lg px-3 py-1 font-bold`}>
            {traceScore}%
          </Badge>
        </div>
        <p className="font-mono text-xs text-slate-500">
          P/N {component.partNumber} | S/N {component.serialNumber}
        </p>
        <p className="text-sm text-slate-600">{component.description}</p>
      </div>

      {/* ── TIMELINE ── */}
      <div className="relative pl-6">
        {/* Vertical connecting line */}
        <div className={`absolute left-[11px] top-0 bottom-0 w-0.5 ${lineColor}`} />

        {timelineItems.map((item, idx) => {
          if (item.type === "gap") {
            const months = Math.round(item.days / 30);
            return (
              <div key={`gap-${idx}`} className="relative my-3">
                {/* Gap marker */}
                <div className="ml-4 border-2 border-dashed border-red-500 bg-red-500/10 rounded-lg p-4 animate-pulse">
                  <p className="text-red-600 font-bold text-center text-sm">
                    {months} MONTHS — NO RECORDS
                  </p>
                  <p className="text-red-500 text-xs text-center mt-1">
                    Where was this part? Was it tampered with? Nobody knows.
                  </p>
                  <p className="text-red-400 text-[10px] text-center mt-1 font-mono">
                    {new Date(item.fromDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    {" → "}
                    {new Date(item.toDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            );
          }

          // Event node
          const { event, index } = item;
          const Icon = eventTypeIcon(event.eventType);
          const isExpanded = expandedEvent === event.id;
          const dateStr = new Date(event.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          return (
            <div
              key={event.id}
              className="relative mb-3"
              style={animateIn ? {
                animation: "timelineIn 0.4s ease forwards",
                animationDelay: `${index * 200}ms`,
                opacity: 0,
              } : undefined}
            >
              {/* Dot on the line */}
              <div className={`absolute left-0 top-3 w-[22px] h-[22px] rounded-full ${dotColor} flex items-center justify-center z-10`}>
                <Icon className="h-3 w-3 text-white" />
              </div>

              {/* Event card */}
              <button
                onClick={() => onToggleEvent(event.id)}
                className="ml-9 w-full text-left bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {formatEventType(event.eventType)}
                    </p>
                    <p className="text-[11px] text-slate-500">{event.facility}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">{dateStr}</span>
                    <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </button>

              {/* ── EXPANDED EVENT DETAILS (US-006) ── */}
              <div className={`ml-9 overflow-hidden transition-all duration-200 ${
                isExpanded ? "max-h-[500px] opacity-100 mt-1" : "max-h-0 opacity-0"
              }`}>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                  {/* Description */}
                  <p className="text-slate-700 leading-relaxed">{event.description}</p>

                  {/* Performer and certs */}
                  {event.performer && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                      <span>Performer: <strong className="text-slate-700">{event.performer}</strong></span>
                      {event.performerCert && <span>Cert: {event.performerCert}</span>}
                      {event.facilityCert && <span>Facility: {event.facilityCert}</span>}
                    </div>
                  )}

                  {/* Work order / CMM */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                    {event.workOrderRef && <span>WO: <strong className="text-slate-700 font-mono">{event.workOrderRef}</strong></span>}
                    {event.cmmReference && <span>CMM: {event.cmmReference}</span>}
                    {event.hoursAtEvent != null && <span>{event.hoursAtEvent.toLocaleString()} hrs</span>}
                    {event.cyclesAtEvent != null && <span>{event.cyclesAtEvent.toLocaleString()} cyc</span>}
                  </div>

                  {/* Evidence */}
                  {event.evidence && event.evidence.length > 0 && (
                    <div className="flex items-center gap-2 text-blue-600">
                      <Camera className="h-3 w-3" />
                      <span>{evidenceSummary(event.evidence)}</span>
                    </div>
                  )}

                  {/* Generated documents */}
                  {event.generatedDocs && event.generatedDocs.length > 0 && (
                    <div className="flex items-center gap-2 text-purple-600">
                      <FileText className="h-3 w-3" />
                      <span>{event.generatedDocs.map((d) => d.title).join(", ")}</span>
                    </div>
                  )}

                  {/* SHA-256 hash */}
                  {event.hash && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Hash className="h-3 w-3" />
                      <span className="font-mono">{event.hash.slice(0, 16)}...</span>
                      <span className="text-[10px]">Tamper-evident record</span>
                    </div>
                  )}

                  {/* Fallback for simple events */}
                  {!event.evidence?.length && !event.generatedDocs?.length && !event.workOrderRef && (
                    <p className="text-slate-400 italic">Core lifecycle record</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── VIEW DIGITAL THREAD LINK ── */}
      <div className="mt-4 ml-9">
        <a
          href={`/parts/${component.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 text-sm text-${traceColor === "green" ? "green" : "red"}-600 hover:underline`}
        >
          View Digital Thread <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
