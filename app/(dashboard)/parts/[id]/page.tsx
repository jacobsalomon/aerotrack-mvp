"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, SeverityBadge } from "@/components/shared/status-badge";
import {
  calculateTraceCompleteness,
  formatDuration,
  type TraceGap,
} from "@/lib/trace-completeness";
import {
  Factory,
  Plane,
  Wrench,
  ClipboardCheck,
  TestTube,
  PackageCheck,
  ArrowRightLeft,
  ArrowRight,
  Trash2,
  Search,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  FileText,
  Hash,
  Scan,
  Loader2,
  ShieldAlert,
  Camera,
  Video,
  Mic,
  Download,
  CheckCircle,
  MapPin,
  PackageOpen,
  RotateCcw,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ────────────────────────────────────────────

interface EvidenceItem {
  id: string;
  type: string;
  fileName: string;
  transcription: string | null;
  capturedBy: string;
  capturedAt: string;
}

interface GeneratedDoc {
  id: string;
  docType: string;
  title: string;
  status: string;
}

interface PartConsumed {
  id: string;
  partNumber: string;
  serialNumber: string | null;
  description: string;
  quantity: number;
}

interface LifecycleEvent {
  id: string;
  eventType: string;
  date: string;
  facility: string;
  facilityType: string;
  facilityCert: string | null;
  performer: string;
  performerCert: string | null;
  description: string;
  hoursAtEvent: number | null;
  cyclesAtEvent: number | null;
  aircraft: string | null;
  operator: string | null;
  workOrderRef: string | null;
  cmmReference: string | null;
  notes: string | null;
  hash: string | null;
  evidence: EvidenceItem[];
  generatedDocs: GeneratedDoc[];
  partsConsumed: PartConsumed[];
}

interface Alert {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  description: string;
  status: string;
}

interface Document {
  id: string;
  docType: string;
  title: string;
  aiSummary: string | null;
  isLegacy: boolean;
}

interface ExceptionItem {
  id: string;
  exceptionType: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  detectedAt: string;
}

interface ComponentDetail {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  oem: string;
  oemDivision: string | null;
  manufactureDate: string;
  manufacturePlant: string | null;
  totalHours: number;
  totalCycles: number;
  timeSinceOverhaul: number | null;
  cyclesSinceOverhaul: number | null;
  status: string;
  currentLocation: string | null;
  currentAircraft: string | null;
  currentOperator: string | null;
  isLifeLimited: boolean;
  lifeLimit: number | null;        // Max cycles/hours if life-limited
  events: LifecycleEvent[];
  alerts: Alert[];
  documents: Document[];
}

// ── Constants ────────────────────────────────────────

const exceptionTypeLabels: Record<string, string> = {
  serial_number_mismatch: "Serial Number Mismatch",
  part_number_mismatch: "Part Number Mismatch",
  cycle_count_discrepancy: "Cycle Count Discrepancy",
  hour_count_discrepancy: "Hour Count Discrepancy",
  documentation_gap: "Documentation Gap",
  missing_release_certificate: "Missing Release Certificate",
  missing_birth_certificate: "Missing Birth Certificate",
  date_inconsistency: "Date Inconsistency",
  unsigned_document: "Unsigned Document",
  missing_facility_certificate: "Missing Facility Certificate",
};

const eventIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  manufacture: Factory,
  install: Plane,
  remove: ArrowRightLeft,
  receiving_inspection: ClipboardCheck,
  teardown: Wrench,
  detailed_inspection: Search,
  repair: Wrench,
  reassembly: Wrench,
  functional_test: TestTube,
  final_inspection: ClipboardCheck,
  release_to_service: PackageCheck,
  transfer: ArrowRightLeft,
  retire: Trash2,
  scrap: Trash2,
};

const eventLabels: Record<string, string> = {
  manufacture: "MANUFACTURED",
  install: "INSTALLED",
  remove: "REMOVED",
  receiving_inspection: "RECEIVING INSPECTION",
  teardown: "TEARDOWN",
  detailed_inspection: "DETAILED INSPECTION",
  repair: "REPAIR",
  reassembly: "REASSEMBLY",
  functional_test: "FUNCTIONAL TEST",
  final_inspection: "FINAL INSPECTION",
  release_to_service: "RELEASED TO SERVICE",
  transfer: "TRANSFER",
  retire: "RETIRED",
  scrap: "SCRAPPED",
};

// Color for each event type icon background
const eventColors: Record<string, string> = {
  manufacture: "bg-emerald-600 text-white",
  install: "bg-blue-600 text-white",
  remove: "bg-orange-500 text-white",
  receiving_inspection: "bg-sky-500 text-white",
  teardown: "bg-slate-500 text-white",
  detailed_inspection: "bg-indigo-500 text-white",
  repair: "bg-amber-600 text-white",
  reassembly: "bg-slate-600 text-white",
  functional_test: "bg-violet-600 text-white",
  final_inspection: "bg-teal-600 text-white",
  release_to_service: "bg-green-600 text-white",
  transfer: "bg-cyan-600 text-white",
  retire: "bg-red-500 text-white",
  scrap: "bg-red-700 text-white",
};

// ── US-003: Expected documents per event type (key events only) ──
// Maps event types to the doc types that SHOULD exist.
// Only key events flag missing docs; others just show what's present.
const expectedDocsByEventType: Record<string, string[]> = {
  manufacture: ["8130-3"],
  release_to_service: ["8130-3"],
  install: ["8130-3"],
};

// Readable labels for doc type chips
const docTypeChipLabels: Record<string, string> = {
  "8130-3": "8130-3",
  "337": "Form 337",
  "8010-4": "8010-4",
  work_order: "WO",
  findings_report: "Findings",
  test_results: "Test",
  birth_certificate: "Birth Cert",
};

// ── US-004: SVG Sparkline helper ──
// Generates an SVG path string from data points for an area chart
function buildSparklinePath(
  points: { x: number; y: number }[],
  width: number,
  height: number
): { linePath: string; areaPath: string } {
  if (points.length < 2) return { linePath: "", areaPath: "" };

  const xMin = points[0].x;
  const xMax = points[points.length - 1].x;
  const yMax = Math.max(...points.map((p) => p.y));
  const yMin = 0;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  // Map data points to SVG coordinates
  const svgPoints = points.map((p) => ({
    sx: ((p.x - xMin) / xRange) * width,
    sy: height - ((p.y - yMin) / yRange) * height,
  }));

  // Build line path
  let linePath = `M ${svgPoints[0].sx} ${svgPoints[0].sy}`;
  for (let i = 1; i < svgPoints.length; i++) {
    linePath += ` L ${svgPoints[i].sx} ${svgPoints[i].sy}`;
  }

  // Build area path (line + close to bottom)
  const areaPath =
    linePath +
    ` L ${svgPoints[svgPoints.length - 1].sx} ${height} L ${svgPoints[0].sx} ${height} Z`;

  return { linePath, areaPath };
}

// ── Trust & Facility Flow Constants ─────────────────

// Icons for each facility type (reuses existing icon imports)
const facilityTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  oem: Factory,
  airline: Plane,
  mro: Wrench,
  distributor: PackageCheck,
  broker: ArrowRightLeft,
};

// Readable label for each facility type
const facilityTypeLabels: Record<string, string> = {
  oem: "OEM",
  airline: "Airline",
  mro: "MRO",
  distributor: "Distributor",
  broker: "Broker",
};

// Trust indicator colors — dot backgrounds
const trustDotColors: Record<string, string> = {
  verified: "bg-green-500",
  partial: "bg-yellow-500",
  gap: "bg-red-500",
  unknown: "bg-gray-300",
};

// Trust indicator text colors
const trustTextColors: Record<string, string> = {
  verified: "text-green-700",
  partial: "text-yellow-700",
  gap: "text-red-700",
  unknown: "text-gray-500",
};

// Trust labels for display
const trustLabels: Record<string, string> = {
  verified: "Verified",
  partial: "Partial",
  gap: "Gap",
  unknown: "Unknown",
};

// ── Facility Stop Type ──────────────────────────────

interface FacilityStop {
  facility: string;       // Full facility name from event data
  shortName: string;      // Abbreviated name for display
  location: string;       // City/region extracted from name
  facilityType: string;   // oem, airline, mro, distributor, broker
  firstDate: string;      // ISO date of first event at this facility
  lastDate: string;       // ISO date of last event at this facility
  dateLabel: string;      // Compact date range like "'19–'22"
  activityLabel: string;  // MFG, SVC, OH, DIST, etc.
  events: LifecycleEvent[];
  trust: "verified" | "partial" | "gap" | "unknown";
  photoCount: number;
  videoCount: number;
  voiceCount: number;
  docCount: number;
  totalEvidence: number;
  gapBefore: TraceGap | null; // Gap leading INTO this facility
}

// ── Facility Helper Functions ───────────────────────

// Parse a facility name into a short display name and location.
// e.g. "ACE Services, Singapore" → { shortName: "ACE Services", location: "Singapore" }
// e.g. "Parker Aerospace — Hydraulic Systems Division" → { shortName: "Parker Aerospace", location: "" }
function parseFacilityName(facility: string): { shortName: string; location: string } {
  // Handle "Company — Division" format (strip the division)
  const dashParts = facility.split(" — ");
  const baseName = dashParts[0];

  // Handle "Company, City" format
  const commaParts = baseName.split(", ");
  if (commaParts.length > 1) {
    return { shortName: commaParts[0], location: commaParts.slice(1).join(", ") };
  }

  // Try to extract location from common patterns like "Company CityName MRO"
  // For names like "United Airlines SFO Maintenance" → "United Airlines", "SFO"
  const mroMatch = baseName.match(/^(.+?)\s+([\w]{3})\s+(Maintenance|MRO|TechOps)$/i);
  if (mroMatch) {
    return { shortName: `${mroMatch[1]} ${mroMatch[3]}`, location: mroMatch[2] };
  }

  return { shortName: baseName, location: "" };
}

// Determine what activity happened at a facility based on its event types.
// Returns a short abbreviation for the facility flow chain.
function getActivityLabel(events: LifecycleEvent[]): string {
  const types = new Set(events.map(e => e.eventType));
  if (types.has("manufacture")) return "MFG";
  if (types.has("teardown") || types.has("repair") || types.has("reassembly")) return "OH";
  if (types.has("receiving_inspection") && !types.has("repair")) return "INSP";
  if (types.has("install")) return "SVC";
  if (types.has("transfer")) return "DIST";
  if (types.has("release_to_service")) return "RTS";
  if (types.has("remove")) return "RMV";
  if (types.has("retire") || types.has("scrap")) return "RTR";
  return "SVC";
}

// Format a compact date range label for the facility flow chain.
// e.g. "'19", "'19–'22", "'23+"
function formatDateLabel(firstDate: string, lastDate: string, isActive: boolean): string {
  const firstYear = new Date(firstDate).getFullYear().toString().slice(-2);
  const lastYear = new Date(lastDate).getFullYear().toString().slice(-2);
  if (isActive) return `'${firstYear}+`;
  if (firstYear === lastYear) return `'${firstYear}`;
  return `'${firstYear}–'${lastYear}`;
}

// Determine trust level for a facility stop based on documentation quality.
// Green = well-documented with certs and hashes
// Yellow = some documentation but incomplete
// Red = documentation gap leads into this facility
// Gray = minimal records
function calculateFacilityTrust(
  events: LifecycleEvent[],
  hasGapBefore: boolean
): "verified" | "partial" | "gap" | "unknown" {
  // If there's a documentation gap before this facility, it's RED
  if (hasGapBefore) return "gap";

  let hasWorkOrder = false;
  let hasCert = false;
  let hasHash = false;
  let hasEvidence = false;

  for (const event of events) {
    if (event.workOrderRef) hasWorkOrder = true;
    if (event.performerCert || event.facilityCert) hasCert = true;
    if (event.hash) hasHash = true;
    if (event.evidence.length > 0) hasEvidence = true;
  }

  // Well-documented: has work orders or certs, plus hash for tamper evidence
  if ((hasWorkOrder || hasCert) && hasHash) return "verified";
  // Partial: some documentation exists
  if (hasWorkOrder || hasCert || hasEvidence) return "partial";
  // Unknown: minimal records
  return "unknown";
}

// Build facility stops from chronologically sorted events.
// Groups consecutive events at the same facility into "stops" —
// each stop represents one visit to a facility.
function buildFacilityStops(
  sortedEvents: LifecycleEvent[],
  gaps: TraceGap[],
  componentStatus: string
): FacilityStop[] {
  if (sortedEvents.length === 0) return [];

  const stops: FacilityStop[] = [];
  let currentFacility = "";
  let currentEvents: LifecycleEvent[] = [];

  // Group consecutive events at the same facility
  for (const event of sortedEvents) {
    if (event.facility !== currentFacility) {
      if (currentEvents.length > 0) {
        stops.push(makeStop(currentEvents, false));
      }
      currentFacility = event.facility;
      currentEvents = [event];
    } else {
      currentEvents.push(event);
    }
  }
  // Don't forget the last group
  if (currentEvents.length > 0) {
    stops.push(makeStop(currentEvents, false));
  }

  // Determine which stops have documentation gaps before them
  for (let i = 1; i < stops.length; i++) {
    const gap = gaps.find(
      g => g.lastFacility === stops[i - 1].facility &&
           g.nextFacility === stops[i].facility
    );
    if (gap) {
      stops[i].gapBefore = gap;
      stops[i].trust = "gap"; // Override trust to red
    }
  }

  // Mark the last stop as "active" if the part is in service
  const isActive = componentStatus === "installed" || componentStatus === "serviceable";
  if (stops.length > 0 && isActive) {
    const last = stops[stops.length - 1];
    last.dateLabel = formatDateLabel(last.firstDate, last.lastDate, true);
  }

  return stops;
}

// Internal helper: create a FacilityStop from a group of events at the same facility
function makeStop(events: LifecycleEvent[], hasGapBefore: boolean): FacilityStop {
  const { shortName, location } = parseFacilityName(events[0].facility);
  const firstDate = events[0].date;
  const lastDate = events[events.length - 1].date;

  // Count evidence across all events at this facility
  let photoCount = 0, videoCount = 0, voiceCount = 0, docCount = 0;
  for (const event of events) {
    for (const ev of event.evidence) {
      if (ev.type === "photo") photoCount++;
      else if (ev.type === "video") videoCount++;
      else if (ev.type === "voice_note") voiceCount++;
    }
    docCount += event.generatedDocs.length;
  }

  return {
    facility: events[0].facility,
    shortName,
    location,
    facilityType: events[0].facilityType,
    firstDate,
    lastDate,
    dateLabel: formatDateLabel(firstDate, lastDate, false),
    activityLabel: getActivityLabel(events),
    events,
    trust: calculateFacilityTrust(events, hasGapBefore),
    photoCount,
    videoCount,
    voiceCount,
    docCount,
    totalEvidence: photoCount + videoCount + voiceCount + docCount,
    gapBefore: null,
  };
}

// Generate simulated industry average trust dots for the "What If" comparison.
// Most parts in the industry have terrible documentation — this shows the contrast.
function getIndustryAverageDots(count: number): ("verified" | "partial" | "gap" | "unknown")[] {
  const pattern: ("verified" | "partial" | "gap" | "unknown")[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) pattern.push("verified"); // OEM manufacture is usually documented
    else if (i % 3 === 0) pattern.push("partial");
    else pattern.push("gap"); // Most stops have poor documentation
  }
  return pattern;
}

// ── Helper: detect who "owns" the part at a given event ──

function getOwner(event: LifecycleEvent): string | null {
  return event.operator || event.facility;
}

// ── Main Page Component ──────────────────────────────

export default function PartDetailPage() {
  const params = useParams();
  const [component, setComponent] = useState<ComponentDetail | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanningExceptions, setScanningExceptions] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedFacility, setExpandedFacility] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  // Tracks which event's "coming soon" tooltip is visible (auto-hides after 2s)
  const [evidenceCta, setEvidenceCta] = useState<string | null>(null);
  // US-001: Active event type filters — all ON by default (populated after data loads)
  const [activeEventTypes, setActiveEventTypes] = useState<Set<string> | null>(null);
  // US-004: Sparkline toggle — "hours" or "cycles"
  const [sparklineMode, setSparklineMode] = useState<"hours" | "cycles">("hours");

  // Fetch component data and exceptions on mount
  useEffect(() => {
    async function fetchComponent() {
      const res = await fetch(apiUrl(`/api/components/${params.id}`));
      if (res.ok) {
        setComponent(await res.json());
      }
      const exRes = await fetch(apiUrl(`/api/exceptions?componentId=${params.id}`));
      if (exRes.ok) {
        setExceptions(await exRes.json());
      }
      setLoading(false);
    }
    fetchComponent();
  }, [params.id]);

  // Run exception scan for this component
  async function scanForExceptions() {
    setScanningExceptions(true);
    try {
      await fetch(apiUrl(`/api/exceptions/scan/${params.id}`), { method: "POST" });
      const exRes = await fetch(apiUrl(`/api/exceptions?componentId=${params.id}`));
      if (exRes.ok) {
        setExceptions(await exRes.json());
      }
    } finally {
      setScanningExceptions(false);
    }
  }

  // Download trace report as PDF
  async function exportTracePdf() {
    setExportingPdf(true);
    try {
      const res = await fetch(apiUrl(`/api/export/trace/${params.id}`));
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trace-report-${component?.serialNumber || params.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setExportingPdf(false);
    }
  }

  // Download a compliance document as PDF
  async function downloadDocument(docId: string, title: string) {
    setDownloadingDoc(docId);
    try {
      const res = await fetch(apiUrl(`/api/documents/download/${docId}`));
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9\-_ ]/g, "")}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setDownloadingDoc(null);
    }
  }

  // Toggle event detail expansion
  function toggleEvent(eventId: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  // Show a brief "coming soon" message when the evidence CTA is clicked
  function handleEvidenceCta(eventId: string) {
    setEvidenceCta(eventId);
    setTimeout(() => setEvidenceCta(null), 2000);
  }

  // ── US-001: Hooks for event type filtering ──
  // These must run on EVERY render (before any early returns) per Rules of Hooks.
  // When component hasn't loaded yet, they operate on empty arrays harmlessly.
  const preSortedEvents = useMemo(
    () => [...(component?.events ?? [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [component?.events]
  );
  const uniqueEventTypes = useMemo(
    () => Array.from(new Set(preSortedEvents.map((e) => e.eventType))),
    [preSortedEvents]
  );
  const resolvedActiveTypes = useMemo(
    () => activeEventTypes ?? new Set(uniqueEventTypes),
    [activeEventTypes, uniqueEventTypes]
  );
  const filteredEvents = useMemo(
    () => preSortedEvents.filter((e) => resolvedActiveTypes.has(e.eventType)),
    [preSortedEvents, resolvedActiveTypes]
  );

  // ── US-004: Sparkline data points from events with hours/cycles ──
  const sparklineData = useMemo(() => {
    const points: { x: number; y: number; label: string }[] = [];
    for (const ev of preSortedEvents) {
      const val = sparklineMode === "hours" ? ev.hoursAtEvent : ev.cyclesAtEvent;
      if (val != null) {
        points.push({
          x: new Date(ev.date).getTime(),
          y: val,
          label: format(new Date(ev.date), "MMM yyyy"),
        });
      }
    }
    return points;
  }, [preSortedEvents, sparklineMode]);
  const sparklinePaths = useMemo(
    () => buildSparklinePath(sparklineData, 200, 48),
    [sparklineData]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!component) {
    return <p className="py-12 text-center text-slate-500">Component not found.</p>;
  }

  // Calculate trace completeness score
  const retiredDate =
    component.status === "retired" || component.status === "scrapped"
      ? component.events[component.events.length - 1]?.date
      : undefined;

  const trace = calculateTraceCompleteness(
    component.manufactureDate,
    component.events,
    component.documents,
    retiredDate
  );

  const openAlerts = component.alerts.filter(
    (a) => a.status !== "resolved" && a.status !== "dismissed"
  );

  // Sort events chronologically for the timeline
  // (reuse the pre-sorted array from the useMemo above — same result)
  const sortedEvents = preSortedEvents;

  // Aggregate all compliance documents (GeneratedDocuments) from all events
  const allComplianceDocs = sortedEvents.flatMap(event =>
    event.generatedDocs.map(doc => ({
      ...doc,
      eventType: event.eventType,
      eventDate: event.date,
      facility: event.facility,
    }))
  );

  // Build facility stops for the Digital Thread visualization.
  // Each stop = one visit to a facility, with trust indicators and evidence counts.
  const facilityStops = buildFacilityStops(sortedEvents, trace.gaps, component.status);

  // Build a map: after facility stop[i], is there a gap before stop[i+1]?
  // Used by the Journey Map to draw red dashed connectors between facilities.
  const gapBetweenStops = new Map<number, TraceGap>();
  for (let i = 1; i < facilityStops.length; i++) {
    if (facilityStops[i].gapBefore) {
      gapBetweenStops.set(i - 1, facilityStops[i].gapBefore!);
    }
  }

  // Industry average trust dots for the "What If" comparison mode
  const industryDots = getIndustryAverageDots(facilityStops.length);

  // Build a map: after event[i], is there a documentation gap?
  const gapAfterEvent = new Map<number, TraceGap>();
  for (const gap of trace.gaps) {
    const idx = sortedEvents.findIndex((e) => e.date === gap.startDate);
    if (idx >= 0) {
      gapAfterEvent.set(idx, gap);
    }
  }

  // Build a matching gap map for the FILTERED events (US-001)
  // so gap indicators still appear correctly when filters are active
  const filteredGapAfterEvent = new Map<number, TraceGap>();
  for (const gap of trace.gaps) {
    const idx = filteredEvents.findIndex((e) => e.date === gap.startDate);
    if (idx >= 0) filteredGapAfterEvent.set(idx, gap);
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <Link href="/dashboard" className="hover:text-blue-700">
          Parts Fleet
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-slate-900 font-medium">{component.partNumber}</span>
      </div>

      {/* ═══ DIGITAL THREAD HERO ═══ */}
      {/* Replaces the old identity card with an expanded view showing        the part's story at a glance: identity, facility flow, trust score */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {/* ── Part Identity Row ── */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold tracking-widest text-blue-600 uppercase">
                  Digital Thread
                </span>
                <StatusBadge status={component.status} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">
                {component.description}
              </h1>
              <p className="text-sm text-slate-500">
                {component.partNumber} · S/N: {component.serialNumber} · {component.oem}
                {component.oemDivision && ` — ${component.oemDivision}`}
              </p>
              {component.currentAircraft && (
                <p className="text-sm text-slate-500 mt-0.5">
                  Currently on <span className="font-medium text-slate-700">{component.currentAircraft}</span>
                  {component.currentOperator && ` (${component.currentOperator})`}
                </p>
              )}
              {component.currentLocation && !component.currentAircraft && (
                <p className="text-sm text-slate-500 mt-0.5">
                  Location: <span className="font-medium text-slate-700">{component.currentLocation}</span>
                </p>
              )}
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={scanForExceptions}
                disabled={scanningExceptions}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {scanningExceptions ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Scan className="h-3.5 w-3.5" />
                )}
                Verify
              </button>
              <button
                onClick={exportTracePdf}
                disabled={exportingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {exportingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export PDF
              </button>
            </div>
          </div>

          {/* ── Facility Flow Chain ── */}
          {/* Horizontal chain showing every facility the part has visited,
              connected by arrows, with trust dots at each stop */}
          <div className="bg-slate-50 rounded-xl p-4 mb-5">
            <div className="flex flex-wrap items-start gap-2">
              {facilityStops.map((stop, i) => (
                <div key={i} className="flex items-start gap-2">
                  {/* Gap connector (red dashed) or arrow connector */}
                  {i > 0 && (
                    gapBetweenStops.has(i - 1) ? (
                      <div className="flex flex-col items-center gap-0.5 pt-2 min-w-[60px]">
                        <div className="w-full border-t-2 border-dashed border-red-400" />
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <span className="text-[9px] font-bold text-red-600 whitespace-nowrap">
                          {formatDuration(gapBetweenStops.get(i - 1)!.days)} GAP
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center pt-4">
                        <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                      </div>
                    )
                  )}

                  {/* Facility bubble */}
                  <div className="flex flex-col items-center text-center min-w-[90px]">
                    <div className="px-3 py-2 bg-white rounded-lg border shadow-sm w-full">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                        {facilityTypeLabels[stop.facilityType] || stop.facilityType}
                      </span>
                      <p className="text-xs font-bold text-slate-800 leading-tight mt-0.5">
                        {stop.shortName}
                      </p>
                      {stop.location && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{stop.location}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">
                      {stop.activityLabel} {stop.dateLabel}
                    </span>
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1 ${trustDotColors[stop.trust]}`}
                      title={trustLabels[stop.trust]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Trace Score + Progress Bar ── */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600">Trace:</span>
              <span className="text-2xl font-bold">{trace.score}%</span>
            </div>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  trace.score > 95 ? "bg-green-500"
                    : trace.score >= 80 ? "bg-yellow-500"
                    : trace.score >= 60 ? "bg-orange-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${trace.score}%` }}
              />
            </div>
            <Badge
              className={`text-xs ${
                trace.rating === "complete" ? "bg-green-100 text-green-800"
                  : trace.rating === "good" ? "bg-yellow-100 text-yellow-800"
                  : trace.rating === "fair" ? "bg-orange-100 text-orange-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {trace.rating.charAt(0).toUpperCase() + trace.rating.slice(1)}
            </Badge>
          </div>

          {/* ── "What If" Comparison Toggle ── */}
          <div className="mb-4">
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              {showComparison ? "Hide comparison" : "Compare with industry average"}
            </button>
            {showComparison && (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg border space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-32 shrink-0">This Component:</span>
                  <div className="flex items-center gap-1">
                    {facilityStops.map((s, i) => (
                      <div key={i} className={`w-3 h-3 rounded-full ${trustDotColors[s.trust]}`} />
                    ))}
                  </div>
                  <span className="text-xs font-bold ml-1">{trace.score}% documented</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-32 shrink-0">Industry Average:</span>
                  <div className="flex items-center gap-1">
                    {industryDots.map((trust, i) => (
                      <div key={i} className={`w-3 h-3 rounded-full ${trustDotColors[trust]}`} />
                    ))}
                  </div>
                  <span className="text-xs font-bold ml-1 text-red-600">~38% documented</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Most aerospace parts have poor documentation — AeroTrack changes that.
                </p>
              </div>
            )}
          </div>

          {/* ── Stats Grid ── */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-blue-700">
                {formatDuration(trace.totalDays)}
              </p>
              <p className="text-xs text-slate-500">Age</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-700">
                {component.totalHours.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">Hours</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-700">
                {component.totalCycles.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">Cycles</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {trace.totalEvents}
              </p>
              <p className="text-xs text-slate-500">Events</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {trace.totalDocuments}
              </p>
              <p className="text-xs text-slate-500">Documents</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${trace.gapCount > 0 ? "text-red-600" : "text-green-600"}`}>
                {trace.gapCount}
              </p>
              <p className="text-xs text-slate-500">Gaps</p>
            </div>
          </div>

          {/* ── US-004: Hours/Cycles Sparkline ── */}
          {/* Small area chart showing how TSN or CSN has accumulated over time */}
          {sparklineData.length >= 2 && (
            <div className="mt-4 p-3 bg-slate-50 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-medium text-slate-600">
                    {sparklineMode === "hours" ? "Hours" : "Cycles"} Accumulation
                  </span>
                </div>
                {/* Toggle between hours and cycles */}
                <div className="flex items-center bg-white rounded border text-xs overflow-hidden">
                  <button
                    onClick={() => setSparklineMode("hours")}
                    className={`px-2 py-0.5 transition-colors ${
                      sparklineMode === "hours"
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Hours
                  </button>
                  <button
                    onClick={() => setSparklineMode("cycles")}
                    className={`px-2 py-0.5 transition-colors ${
                      sparklineMode === "cycles"
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Cycles
                  </button>
                </div>
              </div>
              {/* SVG area chart */}
              <svg viewBox="0 0 200 48" className="w-full h-12" preserveAspectRatio="none">
                {/* Filled area under the line */}
                <path d={sparklinePaths.areaPath} fill="rgb(191 219 254)" opacity="0.5" />
                {/* The line itself */}
                <path d={sparklinePaths.linePath} fill="none" stroke="rgb(37 99 235)" strokeWidth="1.5" />
              </svg>
              {/* Start and end labels */}
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>{sparklineData[0].label}</span>
                <span className="font-medium text-slate-600">
                  {sparklineData[sparklineData.length - 1].y.toLocaleString()}{" "}
                  {sparklineMode === "hours" ? "hrs" : "cyc"}
                </span>
                <span>{sparklineData[sparklineData.length - 1].label}</span>
              </div>
            </div>
          )}

          {/* ── US-002: Life Consumption Gauge ── */}
          {/* Visual fuel-gauge showing how much life this part has consumed */}
          {/* Shown for all parts — life-limited parts get a hard limit bar, */}
          {/* non-LLP parts get a softer "typical overhaul interval" style */}
          {(() => {
            const isLLP = component.isLifeLimited && component.lifeLimit;
            // For non-LLP parts, show a softer gauge based on typical overhaul intervals
            const gaugeLimit = isLLP
              ? component.lifeLimit!
              : Math.max(component.totalCycles, 10000); // fallback reference
            const consumed = component.totalCycles;
            const pct = Math.min(100, Math.round((consumed / gaugeLimit) * 100));
            // Color thresholds: green < 60%, yellow 60-80%, orange 80-90%, red > 90%
            const gaugeColor =
              pct > 90
                ? "bg-red-500"
                : pct > 80
                ? "bg-orange-500"
                : pct > 60
                ? "bg-yellow-500"
                : "bg-green-500";
            const gaugeTextColor =
              pct > 90
                ? "text-red-700"
                : pct > 80
                ? "text-orange-700"
                : pct > 60
                ? "text-yellow-700"
                : "text-green-700";

            return (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border">
                <div className="flex items-center gap-1.5 mb-2">
                  <Gauge className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-600">
                    {isLLP ? "Life Limit Consumption" : "Cycle Accumulation"}
                  </span>
                  {isLLP && (
                    <Badge className="ml-auto bg-red-100 text-red-700 text-[10px] px-1.5 py-0">
                      Life-Limited Part
                    </Badge>
                  )}
                </div>
                {/* Gauge bar */}
                <div className="relative h-5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${gaugeColor}`}
                    style={{ width: `${pct}%` }}
                  />
                  {/* Percentage label centered on bar */}
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                    {pct}%
                  </span>
                </div>
                {/* Labels below the bar */}
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-slate-400">0</span>
                  <span className={`text-[10px] font-semibold ${gaugeTextColor}`}>
                    {consumed.toLocaleString()} / {gaugeLimit.toLocaleString()} cycles
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isLLP ? "LIMIT" : "ref."}
                  </span>
                </div>
                {/* Remaining life callout for LLP parts */}
                {isLLP && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    <span className={`font-bold ${gaugeTextColor}`}>
                      {(gaugeLimit - consumed).toLocaleString()} cycles remaining
                    </span>
                    {" "}before mandatory replacement
                  </p>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ═══ FACILITY JOURNEY MAP ═══ */}
      {/* Horizontal flow diagram showing the part's physical path through
          the supply chain. Each facility is a clickable card that expands
          to show all events and evidence captured there. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Facility Journey</CardTitle>
          <p className="text-sm text-slate-500">
            Every company and shop this part has visited, with documentation quality at each stop
          </p>
        </CardHeader>
        <CardContent>
          {/* Horizontal flow of facility cards */}
          <div className="flex overflow-x-auto gap-0 pb-4">
            {facilityStops.map((stop, i) => {
              const FIcon = facilityTypeIcons[stop.facilityType] || ClipboardCheck;
              return (
                <div key={i} className="flex items-stretch shrink-0">
                  {/* Gap connector — red dashed line with warning */}
                  {i > 0 && gapBetweenStops.has(i - 1) && (
                    <div className="flex flex-col items-center justify-center min-w-[80px] px-2">
                      <div className="border-t-2 border-dashed border-red-400 w-full" />
                      <AlertTriangle className="h-4 w-4 text-red-500 my-1" />
                      <span className="text-xs text-red-600 font-bold text-center whitespace-nowrap">
                        {formatDuration(gapBetweenStops.get(i - 1)!.days)}
                      </span>
                      <span className="text-[10px] text-red-500">unaccounted</span>
                    </div>
                  )}

                  {/* Arrow connector (normal, no gap) */}
                  {i > 0 && !gapBetweenStops.has(i - 1) && (
                    <div className="flex items-center px-1 shrink-0">
                      <div className="w-6 h-px bg-slate-300" />
                      <ArrowRight className="h-4 w-4 text-slate-300 -ml-1" />
                    </div>
                  )}

                  {/* Facility card */}
                  <div
                    className={`min-w-[180px] max-w-[220px] border rounded-lg p-3 cursor-pointer transition-all ${
                      expandedFacility === i
                        ? "ring-2 ring-blue-500 bg-blue-50/50"
                        : "hover:bg-slate-50"
                    }`}
                    onClick={() =>
                      setExpandedFacility(expandedFacility === i ? null : i)
                    }
                  >
                    {/* Type icon + label + trust dot */}
                    <div className="flex items-center gap-2 mb-1">
                      <FIcon className="h-4 w-4 text-slate-500" />
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        {facilityTypeLabels[stop.facilityType] || stop.facilityType}
                      </span>
                      <div
                        className={`w-2.5 h-2.5 rounded-full ml-auto ${trustDotColors[stop.trust]}`}
                      />
                    </div>
                    <p className="font-bold text-sm text-slate-800">
                      {stop.shortName}
                    </p>
                    {stop.location && (
                      <p className="text-xs text-slate-500">{stop.location}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {format(new Date(stop.firstDate), "MMM yyyy")}
                      {stop.firstDate !== stop.lastDate &&
                        ` — ${format(new Date(stop.lastDate), "MMM yyyy")}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {stop.activityLabel} · {stop.events.length} event
                      {stop.events.length !== 1 ? "s" : ""}
                    </p>
                    {/* Evidence summary counts */}
                    {stop.totalEvidence > 0 && (
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                        {stop.photoCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Camera className="h-3 w-3" /> {stop.photoCount}
                          </span>
                        )}
                        {stop.videoCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Video className="h-3 w-3" /> {stop.videoCount}
                          </span>
                        )}
                        {stop.voiceCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Mic className="h-3 w-3" /> {stop.voiceCount}
                          </span>
                        )}
                        {stop.docCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <FileText className="h-3 w-3" /> {stop.docCount}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Trust label */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${trustDotColors[stop.trust]}`}
                      />
                      <span
                        className={`text-[10px] font-medium ${trustTextColors[stop.trust]}`}
                      >
                        {trustLabels[stop.trust]}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Expanded Facility Detail Panel ── */}
          {/* When you click a facility card above, this panel shows all
              events that happened there with evidence and documents */}
          {expandedFacility !== null &&
            facilityStops[expandedFacility] &&
            (() => {
              const stop = facilityStops[expandedFacility];
              const durationDays = Math.ceil(
                (new Date(stop.lastDate).getTime() -
                  new Date(stop.firstDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              return (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg border">
                  {/* Facility header */}
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    <h3 className="font-bold text-slate-800">
                      {stop.facility}
                    </h3>
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${trustDotColors[stop.trust]}`}
                    />
                    <span
                      className={`text-xs font-medium ${trustTextColors[stop.trust]}`}
                    >
                      {trustLabels[stop.trust]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-4 ml-6">
                    {format(new Date(stop.firstDate), "MMM d, yyyy")}
                    {stop.firstDate !== stop.lastDate &&
                      ` — ${format(new Date(stop.lastDate), "MMM d, yyyy")}`}
                    {durationDays > 0 && ` (${formatDuration(durationDays)})`}
                  </p>

                  {/* Gap warning if there's a documentation gap before this facility */}
                  {stop.gapBefore && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-700">
                        <span className="font-bold">
                          {formatDuration(stop.gapBefore.days)}
                        </span>{" "}
                        gap in documentation before this facility. Part arrived
                        from {stop.gapBefore.lastFacility.split(",")[0]} with no
                        transfer records.
                      </p>
                    </div>
                  )}

                  {/* Events at this facility */}
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-6">
                    Events at this facility
                  </p>
                  <div className="space-y-2 ml-6">
                    {stop.events.map((event) => {
                      const EvIcon =
                        eventIcons[event.eventType] || ClipboardCheck;
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 p-3 bg-white rounded-lg border"
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              eventColors[event.eventType] ||
                              "bg-slate-500 text-white"
                            }`}
                          >
                            <EvIcon className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold">
                                {eventLabels[event.eventType] ||
                                  event.eventType.toUpperCase()}
                              </span>
                              <span className="text-xs text-slate-400">
                                {format(
                                  new Date(event.date),
                                  "MMM d, yyyy"
                                )}
                              </span>
                              {event.performer && (
                                <span className="text-xs text-slate-400 ml-auto">
                                  {event.performer}
                                  {event.performerCert &&
                                    ` (${event.performerCert})`}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                              {event.description}
                            </p>
                            {event.workOrderRef && (
                              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                WO: {event.workOrderRef}
                              </p>
                            )}
                            {/* Evidence and generated doc counts */}
                            {(event.evidence.length > 0 ||
                              event.generatedDocs.length > 0) && (
                              <div className="flex items-center gap-3 mt-1.5">
                                {event.evidence.filter(
                                  (e) => e.type === "photo"
                                ).length > 0 && (
                                  <span className="flex items-center gap-1 text-[10px] text-blue-500">
                                    <Camera className="h-3 w-3" />{" "}
                                    {
                                      event.evidence.filter(
                                        (e) => e.type === "photo"
                                      ).length
                                    }{" "}
                                    photos
                                  </span>
                                )}
                                {event.evidence.filter(
                                  (e) => e.type === "video"
                                ).length > 0 && (
                                  <span className="flex items-center gap-1 text-[10px] text-rose-500">
                                    <Video className="h-3 w-3" />{" "}
                                    {
                                      event.evidence.filter(
                                        (e) => e.type === "video"
                                      ).length
                                    }{" "}
                                    videos
                                  </span>
                                )}
                                {event.evidence.filter(
                                  (e) => e.type === "voice_note"
                                ).length > 0 && (
                                  <span className="flex items-center gap-1 text-[10px] text-purple-500">
                                    <Mic className="h-3 w-3" />{" "}
                                    {
                                      event.evidence.filter(
                                        (e) => e.type === "voice_note"
                                      ).length
                                    }{" "}
                                    voice notes
                                  </span>
                                )}
                                {event.generatedDocs.length > 0 && (
                                  <span className="flex items-center gap-1 text-[10px] text-green-600">
                                    <FileText className="h-3 w-3" />{" "}
                                    {event.generatedDocs.length} docs
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Evidence Package CTA — placeholder for future download */}
                            {(event.evidence.length > 0 ||
                              event.generatedDocs.length > 0) && (
                              <div className="mt-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEvidenceCta(event.id);
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors"
                                >
                                  <PackageOpen className="h-2.5 w-2.5" />
                                  Evidence Package
                                </button>
                                {evidenceCta === event.id && (
                                  <p className="text-[9px] text-blue-600 mt-0.5 animate-pulse">
                                    Evidence packaging coming soon
                                  </p>
                                )}
                              </div>
                            )}
                            {/* Voice note transcription excerpt */}
                            {event.evidence.find(
                              (e) =>
                                e.type === "voice_note" && e.transcription
                            ) && (
                              <p className="text-[10px] italic text-slate-500 mt-1">
                                &ldquo;
                                {event.evidence
                                  .find(
                                    (e) =>
                                      e.type === "voice_note" &&
                                      e.transcription
                                  )!
                                  .transcription!.substring(0, 120)}
                                ...&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
        </CardContent>
      </Card>

      {/* ═══ BACK-TO-BIRTH TIMELINE ═══ */}
      <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">Lifecycle Timeline</CardTitle>
                  <p className="text-sm text-slate-500">
                    {filteredEvents.length === sortedEvents.length
                      ? `${component.events.length} events`
                      : `${filteredEvents.length} of ${component.events.length} events`}{" "}
                    from{" "}
                    {sortedEvents.length > 0
                      ? format(new Date(sortedEvents[0].date), "MMM yyyy")
                      : ""}{" "}
                    to{" "}
                    {sortedEvents.length > 0
                      ? format(
                          new Date(sortedEvents[sortedEvents.length - 1].date),
                          "MMM yyyy"
                        )
                      : "present"}
                  </p>
                </div>
                {/* Reset filter button — only shows when some types are hidden */}
                {resolvedActiveTypes.size < uniqueEventTypes.length && (
                  <button
                    onClick={() => setActiveEventTypes(null)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Show all
                  </button>
                )}
              </div>

              {/* ── US-001: Event Type Filter Bar ── */}
              {/* Clickable chips for each event type — toggle to show/hide in the timeline */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {uniqueEventTypes.map((type) => {
                  const isActive = resolvedActiveTypes.has(type);
                  const colorClass = eventColors[type] || "bg-slate-500 text-white";
                  // Extract bg color for active state, use muted version for inactive
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        const next = new Set(resolvedActiveTypes);
                        if (isActive) {
                          next.delete(type);
                        } else {
                          next.add(type);
                        }
                        setActiveEventTypes(next);
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all border ${
                        isActive
                          ? `${colorClass} border-transparent shadow-sm`
                          : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {eventLabels[type] || type}
                      {isActive && (
                        <span className="text-[10px] opacity-70">
                          {sortedEvents.filter((e) => e.eventType === type).length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />

                <div className="space-y-0">
                  {filteredEvents.map((event, index) => {
                    const Icon =
                      eventIcons[event.eventType] || ClipboardCheck;
                    const isExpanded = expandedEvents.has(event.id);
                    const isLast = index === filteredEvents.length - 1;
                    const gap = filteredGapAfterEvent.get(index);

                    // Detect ownership change (company transfer)
                    const prevOwner =
                      index > 0
                        ? getOwner(filteredEvents[index - 1])
                        : null;
                    const currentOwner = getOwner(event);
                    const ownerChanged =
                      prevOwner &&
                      currentOwner &&
                      prevOwner !== currentOwner;

                    // Calculate duration to next event
                    const nextEvent =
                      index < filteredEvents.length - 1
                        ? filteredEvents[index + 1]
                        : null;
                    const daysToNext = nextEvent
                      ? Math.ceil(
                          (new Date(nextEvent.date).getTime() -
                            new Date(event.date).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : null;

                    // Count evidence by type
                    const photoCount = event.evidence.filter(
                      (e) => e.type === "photo"
                    ).length;
                    const videoCount = event.evidence.filter(
                      (e) => e.type === "video"
                    ).length;
                    const voiceCount = event.evidence.filter(
                      (e) => e.type === "voice_note"
                    ).length;
                    const docCount = event.generatedDocs.length;

                    // Get first voice transcription excerpt
                    const voiceExcerpt = event.evidence.find(
                      (e) => e.type === "voice_note" && e.transcription
                    )?.transcription;

                    return (
                      <div key={event.id}>
                        {/* Ownership change divider */}
                        {ownerChanged && (
                          <div className="relative pl-12 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-blue-300" />
                              <span className="text-xs font-medium text-blue-600 px-2 whitespace-nowrap">
                                Transferred to{" "}
                                {event.operator ||
                                  event.facility.split(",")[0]}
                              </span>
                              <div className="flex-1 h-px bg-blue-300" />
                            </div>
                          </div>
                        )}

                        {/* Event row — clickable to expand */}
                        <div
                          className="relative pl-12 py-3 cursor-pointer hover:bg-slate-50/50 rounded-lg transition-colors"
                          onClick={() => toggleEvent(event.id)}
                        >
                          {/* Colored icon circle */}
                          <div
                            className={`absolute left-2 top-3 w-7 h-7 rounded-full flex items-center justify-center ${
                              eventColors[event.eventType] ||
                              "bg-slate-500 text-white"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>

                          <div>
                            {/* Event header with date */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm tracking-wide">
                                {eventLabels[event.eventType] ||
                                  event.eventType.toUpperCase()}
                              </span>
                              {event.aircraft && (
                                <span className="text-sm text-slate-600">
                                  on {event.aircraft}
                                  {event.operator &&
                                    ` (${event.operator})`}
                                </span>
                              )}
                              <span className="ml-auto text-sm font-medium text-slate-500">
                                {format(
                                  new Date(event.date),
                                  "MMM d, yyyy"
                                )}
                              </span>
                              <ChevronDown
                                className={`h-4 w-4 text-slate-400 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </div>

                            {/* Facility name */}
                            <p className="text-sm text-slate-500 mt-0.5">
                              {event.facility}
                            </p>

                            {/* Hours and cycles at this event */}
                            {(event.hoursAtEvent != null ||
                              event.cyclesAtEvent != null) && (
                              <div className="flex items-center gap-3 mt-1">
                                {event.hoursAtEvent != null && (
                                  <span className="text-xs text-slate-400">
                                    Hours:{" "}
                                    {event.hoursAtEvent.toLocaleString()}
                                  </span>
                                )}
                                {event.cyclesAtEvent != null && (
                                  <span className="text-xs text-slate-400">
                                    Cycles:{" "}
                                    {event.cyclesAtEvent.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* ── US-003: Document Chips ── */}
                            {/* Show actual doc type badges for attached docs,  */}
                            {/* plus dashed badges for expected-but-missing docs */}
                            {(() => {
                              // Docs that ARE attached to this event
                              const attachedTypes = event.generatedDocs.map((d) => d.docType);
                              // Docs that SHOULD be attached based on event type
                              const expected = expectedDocsByEventType[event.eventType] || [];
                              // Missing = expected but not present
                              const missing = expected.filter((dt) => !attachedTypes.includes(dt));
                              if (attachedTypes.length === 0 && missing.length === 0) return null;
                              return (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                  {/* Solid chips for attached documents */}
                                  {attachedTypes.map((dt, i) => (
                                    <span
                                      key={`doc-${i}`}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded border border-green-200"
                                    >
                                      <FileText className="h-2.5 w-2.5" />
                                      {docTypeChipLabels[dt] || dt}
                                    </span>
                                  ))}
                                  {/* Dashed chips for missing expected documents */}
                                  {missing.map((dt, i) => (
                                    <span
                                      key={`miss-${i}`}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border border-dashed border-red-300 text-red-400"
                                      title={`Expected ${docTypeChipLabels[dt] || dt} not found`}
                                    >
                                      <FileText className="h-2.5 w-2.5" />
                                      {docTypeChipLabels[dt] || dt}
                                      <span className="text-[8px]">?</span>
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}

                            {/* Evidence counts (docs, photos, videos, voice notes) */}
                            {(docCount > 0 ||
                              photoCount > 0 ||
                              videoCount > 0 ||
                              voiceCount > 0) && (
                              <div className="flex items-center gap-3 mt-1.5">
                                {docCount > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <FileText className="h-3 w-3" />
                                    {docCount} document
                                    {docCount !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {photoCount > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <Camera className="h-3 w-3" />
                                    {photoCount} photo
                                    {photoCount !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {videoCount > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <Video className="h-3 w-3" />
                                    {videoCount} video
                                    {videoCount !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {voiceCount > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <Mic className="h-3 w-3" />
                                    {voiceCount} voice note
                                    {voiceCount !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Evidence Package CTA — placeholder for future download */}
                            {(event.evidence.length > 0 ||
                              event.generatedDocs.length > 0) && (
                              <div className="mt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEvidenceCta(event.id);
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
                                >
                                  <PackageOpen className="h-3 w-3" />
                                  Download Evidence Package
                                </button>
                                {evidenceCta === event.id && (
                                  <p className="text-[10px] text-blue-600 mt-1 animate-pulse">
                                    Evidence packaging coming soon
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Voice note excerpt */}
                            {voiceExcerpt && (
                              <p className="text-xs italic text-slate-500 mt-1.5 line-clamp-2">
                                &ldquo;
                                {voiceExcerpt.substring(0, 150)}
                                {voiceExcerpt.length > 150 ? "..." : ""}
                                &rdquo;
                              </p>
                            )}

                            {/* Technician notes */}
                            {event.notes && (
                              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                                <p className="font-medium text-amber-800 text-xs mb-1">
                                  Technician Note
                                </p>
                                <p className="text-amber-900 italic text-xs">
                                  &ldquo;
                                  {event.notes.substring(0, 200)}
                                  {event.notes.length > 200 ? "..." : ""}
                                  &rdquo;
                                </p>
                                {event.performerCert && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    — {event.performer} (
                                    {event.performerCert})
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Hash */}
                            {event.hash && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <Hash className="h-3 w-3 text-slate-300" />
                                <span className="text-xs font-mono text-slate-300">
                                  {event.hash.substring(0, 16)}...
                                </span>
                              </div>
                            )}

                            {/* ─── EXPANDED DETAIL PANEL ─── */}
                            {isExpanded && (
                              <div
                                className="mt-3 p-4 bg-slate-50 rounded-lg border space-y-4"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Full event description */}
                                <div>
                                  <p className="text-xs font-medium text-slate-500 mb-1">
                                    Full Description
                                  </p>
                                  <p className="text-sm text-slate-700">
                                    {event.description}
                                  </p>
                                </div>

                                {/* Performer and work order details */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-xs font-medium text-slate-500 mb-1">
                                      Performer
                                    </p>
                                    <p className="text-slate-700">
                                      {event.performer}
                                    </p>
                                    {event.performerCert && (
                                      <p className="text-xs text-slate-400">
                                        Cert: {event.performerCert}
                                      </p>
                                    )}
                                  </div>
                                  {event.workOrderRef && (
                                    <div>
                                      <p className="text-xs font-medium text-slate-500 mb-1">
                                        Work Order
                                      </p>
                                      <p className="text-slate-700 font-mono text-xs">
                                        {event.workOrderRef}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* CMM reference */}
                                {event.cmmReference && (
                                  <div>
                                    <p className="text-xs font-medium text-slate-500 mb-1">
                                      CMM Reference
                                    </p>
                                    <p className="text-sm text-slate-700">
                                      {event.cmmReference}
                                    </p>
                                  </div>
                                )}

                                {/* Full notes (if truncated above) */}
                                {event.notes &&
                                  event.notes.length > 200 && (
                                    <div>
                                      <p className="text-xs font-medium text-slate-500 mb-1">
                                        Full Technician Notes
                                      </p>
                                      <p className="text-sm text-amber-900 italic">
                                        &ldquo;{event.notes}&rdquo;
                                      </p>
                                    </div>
                                  )}

                                {/* Evidence gallery */}
                                {event.evidence.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-slate-500 mb-2">
                                      Evidence ({event.evidence.length} item
                                      {event.evidence.length !== 1
                                        ? "s"
                                        : ""}
                                      )
                                    </p>
                                    <div className="space-y-2">
                                      {event.evidence.map((ev) => (
                                        <div
                                          key={ev.id}
                                          className="flex items-start gap-2 p-2 bg-white rounded border"
                                        >
                                          {ev.type === "photo" && (
                                            <Camera className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                                          )}
                                          {ev.type === "video" && (
                                            <Video className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                                          )}
                                          {ev.type === "voice_note" && (
                                            <Mic className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                                          )}
                                          {ev.type !== "photo" &&
                                            ev.type !== "video" &&
                                            ev.type !== "voice_note" && (
                                              <FileText className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                                            )}
                                          <div>
                                            <p className="text-xs font-medium">
                                              {ev.fileName}
                                            </p>
                                            {ev.transcription && (
                                              <p className="text-xs text-slate-500 italic mt-1">
                                                &ldquo;
                                                {ev.transcription}
                                                &rdquo;
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Generated documents */}
                                {event.generatedDocs.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-slate-500 mb-2">
                                      Generated Documents
                                    </p>
                                    <div className="space-y-2">
                                      {event.generatedDocs.map((doc) => (
                                        <div
                                          key={doc.id}
                                          className="flex items-center gap-2 p-2 bg-white rounded border"
                                        >
                                          <FileText className="h-4 w-4 text-green-500 shrink-0" />
                                          <span className="text-xs">
                                            {doc.title}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className="text-xs ml-auto"
                                          >
                                            {doc.docType.replace("_", " ")}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Parts consumed during this event */}
                                {event.partsConsumed.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-slate-500 mb-2">
                                      Parts Consumed
                                    </p>
                                    <div className="space-y-1">
                                      {event.partsConsumed.map((part) => (
                                        <div
                                          key={part.id}
                                          className="flex items-center gap-2 text-xs p-2 bg-white rounded border"
                                        >
                                          <span className="font-mono">
                                            {part.partNumber}
                                          </span>
                                          {part.serialNumber && (
                                            <span className="text-slate-400">
                                              S/N: {part.serialNumber}
                                            </span>
                                          )}
                                          <span className="text-slate-600">
                                            {part.description}
                                          </span>
                                          {part.quantity > 1 && (
                                            <span className="text-slate-400">
                                              x{part.quantity}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Full hash */}
                                {event.hash && (
                                  <div>
                                    <p className="text-xs font-medium text-slate-500 mb-1">
                                      Data Hash (SHA-256)
                                    </p>
                                    <p className="text-xs font-mono text-slate-400 break-all">
                                      {event.hash}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Duration bar or gap visualization between events */}
                        {!isLast && (
                          <div className="relative pl-12 py-1">
                            {gap ? (
                              /* ─── RED GAP SECTION ─── */
                              <div
                                className={`flex items-center gap-2 p-2 rounded-lg border-2 border-dashed ${
                                  gap.severity === "critical"
                                    ? "border-red-400 bg-red-50"
                                    : gap.severity === "warning"
                                    ? "border-red-300 bg-red-50"
                                    : "border-orange-300 bg-orange-50"
                                }`}
                              >
                                <AlertTriangle
                                  className={`h-4 w-4 shrink-0 ${
                                    gap.severity === "critical"
                                      ? "text-red-600"
                                      : "text-red-500"
                                  }`}
                                />
                                <div className="flex-1">
                                  <p
                                    className={`font-bold ${
                                      gap.severity === "critical"
                                        ? "text-red-700 text-sm"
                                        : "text-red-600 text-xs"
                                    }`}
                                  >
                                    {formatDuration(gap.days)} — NO
                                    DOCUMENTATION
                                  </p>
                                  <p className="text-xs text-red-500 mt-0.5">
                                    No records between{" "}
                                    {gap.lastFacility.split(",")[0]} and{" "}
                                    {gap.nextFacility.split(",")[0]}.{" "}
                                    {gap.days} days unaccounted for.
                                  </p>
                                </div>
                              </div>
                            ) : daysToNext && daysToNext > 1 ? (
                              /* ─── NORMAL DURATION BAR ─── */
                              <div className="flex items-center gap-2 px-2">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-xs text-slate-400 whitespace-nowrap">
                                  {formatDuration(daysToNext)}
                                </span>
                                <div className="flex-1 h-px bg-slate-200" />
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

      {/* ═══ COMPLIANCE DOCUMENTS (AI-Generated) ═══ */}
      {allComplianceDocs.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Compliance Documents</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  AI-generated FAA compliance documents from maintenance events
                </p>
              </div>
              <Badge className="bg-blue-100 text-blue-800">
                {allComplianceDocs.length} document{allComplianceDocs.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allComplianceDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-slate-50 transition-colors"
                >
                  <FileText className="h-6 w-6 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{doc.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {doc.docType === "8130-3" ? "FAA 8130-3" :
                         doc.docType === "337" ? "FAA Form 337" :
                         doc.docType === "8010-4" ? "FAA Form 8010-4" :
                         doc.docType.replace("_", " ")}
                      </Badge>
                      <Badge
                        className={`text-xs ${
                          doc.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : doc.status === "signed"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {doc.status}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {format(new Date(doc.eventDate), "MMM d, yyyy")}
                        {" · "}
                        {doc.facility.split(",")[0]}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadDocument(doc.id, doc.title)}
                    disabled={downloadingDoc === doc.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {downloadingDoc === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    PDF
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ BOTTOM: EXCEPTIONS + DOCUMENTS SIDE BY SIDE ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Exceptions & Alerts */}
        <div className="space-y-4">
          {/* Exception summary badge */}
          {(() => {
            const openExceptions = exceptions.filter(
              (e) => e.status === "open" || e.status === "investigating"
            );
            const critCount = openExceptions.filter(
              (e) => e.severity === "critical"
            ).length;
            const warnCount = openExceptions.filter(
              (e) => e.severity === "warning"
            ).length;

            if (openExceptions.length > 0) {
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800">
                    {openExceptions.length} Open Exception
                    {openExceptions.length !== 1 ? "s" : ""}
                    {critCount > 0 && ` (${critCount} Critical`}
                    {critCount > 0 && warnCount > 0 && `, ${warnCount} Warning`}
                    {critCount > 0 && ")"}
                    {critCount === 0 && warnCount > 0 && ` (${warnCount} Warning)`}
                  </span>
                </div>
              );
            }
            if (exceptions.length > 0) {
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    No open exceptions
                  </span>
                </div>
              );
            }
            return null;
          })()}

          {/* Exception cards */}
          {exceptions
            .filter((e) => e.status === "open" || e.status === "investigating")
            .map((exception) => (
              <Card
                key={exception.id}
                className={`border-l-4 ${
                  exception.severity === "critical"
                    ? "border-l-red-500 bg-red-50"
                    : exception.severity === "warning"
                    ? "border-l-yellow-500 bg-yellow-50"
                    : "border-l-blue-500 bg-blue-50"
                }`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      className={`h-5 w-5 mt-0.5 ${
                        exception.severity === "critical"
                          ? "text-red-600"
                          : exception.severity === "warning"
                          ? "text-yellow-600"
                          : "text-blue-600"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{exception.title}</p>
                        <SeverityBadge severity={exception.severity} />
                        <Badge variant="outline" className="text-xs">
                          {exceptionTypeLabels[exception.exceptionType] ||
                            exception.exceptionType}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {exception.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

          {/* Alert cards */}
          {openAlerts.map((alert) => (
            <Card
              key={alert.id}
              className={`border-l-4 ${
                alert.severity === "critical"
                  ? "border-l-red-500 bg-red-50"
                  : alert.severity === "warning"
                  ? "border-l-yellow-500 bg-yellow-50"
                  : "border-l-blue-500 bg-blue-50"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`h-5 w-5 mt-0.5 ${
                      alert.severity === "critical"
                        ? "text-red-600"
                        : alert.severity === "warning"
                        ? "text-yellow-600"
                        : "text-blue-600"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{alert.title}</p>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      {alert.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right column: Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {component.documents.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No documents
              </p>
            ) : (
              <div className="space-y-3">
                {component.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-3 p-3 rounded-lg border hover:bg-slate-50"
                  >
                    <FileText className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {doc.docType.replace("_", " ")}
                      </Badge>
                      {doc.isLegacy && (
                        <Badge
                          variant="outline"
                          className="text-xs mt-1 ml-1 bg-orange-50 text-orange-700"
                        >
                          Legacy (scanned)
                        </Badge>
                      )}
                      {doc.aiSummary && (
                        <p className="text-xs text-slate-500 mt-1">
                          {doc.aiSummary}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
