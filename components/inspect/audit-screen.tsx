"use client";

// Evidence Audit Screen
// Displays every inspection item grouped by section, with expandable
// evidence detail panels showing transcript text, audio playback,
// and video still frames for each measurement source.

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Mic,
  Video,
  Keyboard,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Play,
  Pause,
  ImageOff,
  VolumeX,
  Shield,
  ShieldAlert,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────

interface AuditSource {
  id: string;
  sourceType: string; // audio_callout | video_frame | photo_gauge | manual_entry
  value: number;
  unit: string;
  confidence: number;
  rawExcerpt: string | null;
  timestamp: number | null;       // chunk-relative — used for audio/video seeking
  sessionTimestamp: number | null; // session-relative — used for display labels
  evidence: {
    id: string;
    fileUrl: string;
    mimeType: string;
    type: string;
    durationSeconds: number | null;
  } | null;
}

interface AuditMeasurement {
  id: string;
  value: number;
  unit: string;
  confidence: number;
  corroborationLevel: string;
  status: string;
  measuredAt: string;
  sources: AuditSource[];
}

interface AuditItem {
  id: string;
  calloutNumber: string | null;
  parameterName: string;
  specification: string;
  specValueLow: number | null;
  specValueHigh: number | null;
  specUnit: string | null;
  itemType: string;
  sortOrder: number;
  progress: {
    status: string;
    result: string | null;
    measurementId: string | null;
    notes: string | null;
    completedAt: string | null;
  } | null;
  measurement: AuditMeasurement | null;
}

interface AuditSection {
  id: string;
  title: string;
  figureNumber: string;
  sortOrder: number;
  items: AuditItem[];
}

interface AuditSession {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  signedOffAt: string | null;
  configurationVariant: string | null;
  user: { id: string; name: string | null; firstName: string | null; lastName: string | null; badgeNumber: string | null };
  signedOffBy: { id: string; name: string | null; firstName: string | null; lastName: string | null } | null;
  component: { id: string; partNumber: string; serialNumber: string; description: string } | null;
  template: { id: string; title: string; revisionDate: string | null; version: number } | null;
}

// ── Main Component ─────────────────────────────────────

export default function AuditScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AuditSession | null>(null);
  const [sections, setSections] = useState<AuditSection[]>([]);

  // Track which sections are collapsed (all expanded by default)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Track which item is expanded to show evidence detail
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    async function loadAuditData() {
      try {
        const res = await fetch(apiUrl(`/api/inspect/sessions/${sessionId}/audit`));
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load audit data");
        }
        const json = await res.json();
        setSession(json.data.session);
        setSections(json.data.sections);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    loadAuditData();
  }, [sessionId]);

  function toggleSection(sectionId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function toggleItem(itemId: string) {
    setExpandedItem((prev) => (prev === itemId ? null : itemId));
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white/50" />
        <span className="ml-3 text-white/50">Loading audit data...</span>
      </div>
    );
  }

  // Error state
  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-white/70">{error || "Session not found"}</p>
        <Button variant="ghost" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const mechanicName = session.user.firstName && session.user.lastName
    ? `${session.user.firstName} ${session.user.lastName}`
    : session.user.name || "Unknown";

  // Count totals for the summary
  const allItems = sections.flatMap((s) => s.items);
  const withSources = allItems.filter((i) => i.measurement && i.measurement.sources.length > 0);
  const withoutSources = allItems.filter((i) => !i.measurement || i.measurement.sources.length === 0);
  const corroborated = allItems.filter((i) => i.measurement?.corroborationLevel === "corroborated");
  const conflicting = allItems.filter((i) => i.measurement?.corroborationLevel === "conflicting");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-white/50 hover:text-white">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1" />
        <Badge variant="outline" className="text-white/70 border-white/20">
          <Eye className="w-3 h-3 mr-1" /> Read-only
        </Badge>
      </div>

      {/* Session Info Card */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Evidence Provenance Audit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-white/40 block">Template</span>
              <span className="text-white">{session.template?.title || "—"}</span>
            </div>
            <div>
              <span className="text-white/40 block">Component</span>
              <span className="text-white">
                {session.component ? `${session.component.partNumber} / ${session.component.serialNumber}` : "—"}
              </span>
            </div>
            <div>
              <span className="text-white/40 block">Mechanic</span>
              <span className="text-white">{mechanicName}</span>
            </div>
            <div>
              <span className="text-white/40 block">Date</span>
              <span className="text-white">
                {new Date(session.startedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10 mt-3">
            <Badge className="bg-white/10 text-white/70">{allItems.length} items</Badge>
            <Badge className="bg-green-500/20 text-green-400">{withSources.length} with evidence</Badge>
            <Badge className="bg-white/5 text-white/40">{withoutSources.length} no evidence</Badge>
            {corroborated.length > 0 && (
              <Badge className="bg-blue-500/20 text-blue-400">{corroborated.length} corroborated</Badge>
            )}
            {conflicting.length > 0 && (
              <Badge className="bg-red-500/20 text-red-400">{conflicting.length} conflicts</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sections + Items */}
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          collapsed={collapsedSections.has(section.id)}
          onToggleSection={() => toggleSection(section.id)}
          expandedItem={expandedItem}
          onToggleItem={toggleItem}
        />
      ))}

      {sections.length === 0 && (
        <p className="text-center text-white/40 py-12">No inspection items found for this session.</p>
      )}
    </div>
  );
}

// ── Section Block ──────────────────────────────────────

function SectionBlock({
  section,
  collapsed,
  onToggleSection,
  expandedItem,
  onToggleItem,
}: {
  section: AuditSection;
  collapsed: boolean;
  onToggleSection: () => void;
  expandedItem: string | null;
  onToggleItem: (id: string) => void;
}) {
  const itemsWithEvidence = section.items.filter((i) => i.measurement && i.measurement.sources.length > 0).length;

  return (
    <Card className="bg-white/5 border-white/10">
      {/* Section header — clickable to collapse */}
      <button
        onClick={onToggleSection}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-white font-medium text-sm">
            Fig. {section.figureNumber} — {section.title}
          </span>
        </div>
        <Badge variant="outline" className="text-white/50 border-white/15 text-xs shrink-0">
          {itemsWithEvidence}/{section.items.length} evidenced
        </Badge>
      </button>

      {/* Items list */}
      {!collapsed && (
        <div className="border-t border-white/5">
          {section.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              expanded={expandedItem === item.id}
              onToggle={() => onToggleItem(item.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Item Row ───────────────────────────────────────────

function ItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: AuditItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasEvidence = item.measurement && item.measurement.sources.length > 0;
  const sourceCount = item.measurement?.sources.length ?? 0;
  const isCaptured = item.progress?.status === "done" || item.progress?.status === "problem";

  // Determine which source types are present
  const sourceTypes = new Set(item.measurement?.sources.map((s) => s.sourceType) ?? []);
  const hasAudio = sourceTypes.has("audio_callout");
  const hasVideo = sourceTypes.has("video_frame") || sourceTypes.has("photo_gauge");
  const hasManual = sourceTypes.has("manual_entry");

  // Result badge
  const result = item.progress?.result;
  const resultBadge = result === "in_spec" || result === "pass"
    ? { label: "PASS", className: "bg-green-500/20 text-green-400" }
    : result === "out_of_spec" || result === "fail"
    ? { label: "FAIL", className: "bg-red-500/20 text-red-400" }
    : null;

  return (
    <div className={cn("border-t border-white/5", !hasEvidence && "opacity-50")}>
      {/* Clickable row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        {/* Callout number */}
        <span className="text-white/40 font-mono text-xs w-10 shrink-0 text-right">
          {item.calloutNumber || "—"}
        </span>

        {/* Parameter name */}
        <span className="flex-1 text-white text-sm truncate">{item.parameterName}</span>

        {/* Value + result */}
        <div className="flex items-center gap-2 shrink-0">
          {isCaptured && item.measurement ? (
            <>
              <span className="text-white/70 text-sm font-mono">
                {item.measurement.value} {item.measurement.unit}
              </span>
              {resultBadge && (
                <Badge className={cn("text-xs", resultBadge.className)}>{resultBadge.label}</Badge>
              )}
            </>
          ) : (
            <span className="text-white/30 text-xs italic">Not captured</span>
          )}
        </div>

        {/* Source type icons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <Mic className={cn("w-3.5 h-3.5", hasAudio ? "text-blue-400" : "text-white/15")} />
          <Video className={cn("w-3.5 h-3.5", hasVideo ? "text-purple-400" : "text-white/15")} />
          <Keyboard className={cn("w-3.5 h-3.5", hasManual ? "text-amber-400" : "text-white/15")} />
        </div>

        {/* Source count + corroboration */}
        <div className="flex items-center gap-1.5 shrink-0 w-28 justify-end">
          {sourceCount > 0 && (
            <span className="text-white/40 text-xs">{sourceCount} source{sourceCount !== 1 ? "s" : ""}</span>
          )}
          {item.measurement?.corroborationLevel === "corroborated" && (
            <Badge className="bg-blue-500/20 text-blue-400 text-xs px-1.5">
              <Check className="w-3 h-3 mr-0.5" /> corroborated
            </Badge>
          )}
          {item.measurement?.corroborationLevel === "conflicting" && (
            <Badge className="bg-red-500/20 text-red-400 text-xs px-1.5">
              <ShieldAlert className="w-3 h-3 mr-0.5" /> conflict
            </Badge>
          )}
        </div>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
        )}
      </button>

      {/* Evidence detail panel (US-002) */}
      {expanded && <EvidenceDetailPanel item={item} />}
    </div>
  );
}

// ── Evidence Detail Panel (US-002) ─────────────────────

function EvidenceDetailPanel({ item }: { item: AuditItem }) {
  if (!item.measurement || item.measurement.sources.length === 0) {
    return (
      <div className="px-4 pb-4 pl-14">
        <div className="bg-white/5 rounded-lg p-4 text-center text-white/40 text-sm">
          No evidence captured for this item
        </div>
      </div>
    );
  }

  // Sort sources by timestamp (earliest first), nulls last
  const sortedSources = [...item.measurement.sources].sort((a, b) => {
    if (a.timestamp == null && b.timestamp == null) return 0;
    if (a.timestamp == null) return 1;
    if (b.timestamp == null) return -1;
    return a.timestamp - b.timestamp;
  });

  return (
    <div className="px-4 pb-4 pl-14 space-y-3">
      {sortedSources.map((source) => (
        <SourceCard key={source.id} source={source} />
      ))}
    </div>
  );
}

// ── Source Card ─────────────────────────────────────────

function SourceCard({ source }: { source: AuditSource }) {
  // Source type display config
  const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    audio_callout: { label: "Audio", icon: <Mic className="w-3.5 h-3.5" />, color: "bg-blue-500/20 text-blue-400" },
    video_frame: { label: "Video", icon: <Video className="w-3.5 h-3.5" />, color: "bg-purple-500/20 text-purple-400" },
    photo_gauge: { label: "Photo", icon: <Video className="w-3.5 h-3.5" />, color: "bg-purple-500/20 text-purple-400" },
    manual_entry: { label: "Manual", icon: <Keyboard className="w-3.5 h-3.5" />, color: "bg-amber-500/20 text-amber-400" },
  };

  const config = typeConfig[source.sourceType] || typeConfig.manual_entry;

  // Format the session timestamp (seconds → "MM:SS into session")
  // Use sessionTimestamp for display (session-global), fall back to timestamp (chunk-relative)
  const displayTs = source.sessionTimestamp ?? source.timestamp;
  const timestampLabel = displayTs != null
    ? `${Math.floor(displayTs / 60)}:${String(Math.floor(displayTs % 60)).padStart(2, "0")} into session`
    : null;

  return (
    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3">
      {/* Header row: type badge + value + confidence + timestamp */}
      <div className="flex items-center flex-wrap gap-2">
        <Badge className={cn("text-xs flex items-center gap-1", config.color)}>
          {config.icon} {config.label}
        </Badge>
        <span className="text-white/70 text-sm font-mono">
          {source.value} {source.unit}
        </span>
        <ConfidenceBadge confidence={source.confidence} />
        {timestampLabel && (
          <span className="text-white/30 text-xs ml-auto">{timestampLabel}</span>
        )}
      </div>

      {/* Raw excerpt — quote-style block */}
      {source.rawExcerpt && (
        <blockquote className="border-l-2 border-white/20 pl-3 text-white/60 text-sm italic">
          &ldquo;{source.rawExcerpt}&rdquo;
        </blockquote>
      )}

      {/* Manual entry display */}
      {source.sourceType === "manual_entry" && (
        <p className="text-white/50 text-sm">Entered manually</p>
      )}

      {/* Audio player (US-003) */}
      {source.sourceType === "audio_callout" && source.evidence && (
        <MiniAudioPlayer
          fileUrl={source.evidence.fileUrl}
          timestamp={source.timestamp}
        />
      )}
      {source.sourceType === "audio_callout" && !source.evidence && (
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <VolumeX className="w-4 h-4" /> Audio file unavailable
        </div>
      )}

      {/* Video still frame (US-004) */}
      {(source.sourceType === "video_frame" || source.sourceType === "photo_gauge") && source.evidence && (
        <VideoStillFrame
          fileUrl={source.evidence.fileUrl}
          timestamp={source.timestamp}
          mimeType={source.evidence.mimeType}
        />
      )}
      {(source.sourceType === "video_frame" || source.sourceType === "photo_gauge") && !source.evidence && (
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <ImageOff className="w-4 h-4" /> Video file unavailable
        </div>
      )}
    </div>
  );
}

// ── Confidence Badge ───────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 90 ? "text-green-400 bg-green-500/10" :
    pct >= 70 ? "text-amber-400 bg-amber-500/10" :
    "text-red-400 bg-red-500/10";

  return (
    <Badge className={cn("text-xs", color)}>
      {pct}% confident
    </Badge>
  );
}

// ── Mini Audio Player (US-003) ─────────────────────────

function MiniAudioPlayer({
  fileUrl,
  timestamp,
}: {
  fileUrl: string;
  timestamp: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(true);
  const [audioError, setAudioError] = useState(false);
  const autoPauseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start 3 seconds before the callout timestamp (or 0 if no timestamp)
  const startTime = Math.max(0, (timestamp ?? 0) - 3);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
    audio.currentTime = startTime;
    setAudioLoading(false);
  }, [startTime]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      if (autoPauseRef.current) clearTimeout(autoPauseRef.current);
      setPlaying(false);
    } else {
      // Reset to start position if we've gone past the window
      if (audio.currentTime > startTime + 10 || audio.currentTime < startTime) {
        audio.currentTime = startTime;
      }
      audio.play();
      setPlaying(true);

      // Auto-pause after 10 seconds of playback
      autoPauseRef.current = setTimeout(() => {
        audio.pause();
        setPlaying(false);
      }, 10000);
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (audioError) {
    return (
      <div className="flex items-center gap-2 text-white/30 text-sm">
        <VolumeX className="w-4 h-4" /> Audio file unavailable
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-md p-3 space-y-2">
      <audio
        ref={audioRef}
        src={fileUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setPlaying(false)}
        onError={() => setAudioError(true)}
      />

      {audioLoading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading audio...
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 accent-blue-400 bg-white/10 rounded-full cursor-pointer"
          />
          <span className="text-white/40 text-xs font-mono w-12 text-right">
            {formatTime(currentTime)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Video Still Frame (US-004) ─────────────────────────

function VideoStillFrame({
  fileUrl,
  timestamp,
  mimeType,
}: {
  fileUrl: string;
  timestamp: number | null;
  mimeType: string;
}) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameError, setFrameError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // If it's an image (photo_gauge), just display it directly
  const isImage = mimeType.startsWith("image/");

  useEffect(() => {
    if (isImage) {
      setFrameUrl(fileUrl);
      setFrameLoading(false);
      return;
    }

    // For video: create offscreen <video>, seek to timestamp, capture frame
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;

    let cancelled = false;

    video.addEventListener("loadedmetadata", () => {
      if (cancelled) return;
      // Seek to the timestamp, or first frame if null
      video.currentTime = timestamp ?? 0;
    });

    video.addEventListener("seeked", () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setFrameUrl(dataUrl);
        }
      } catch {
        setFrameError(true);
      }
      setFrameLoading(false);
      // Clean up the video element
      video.src = "";
      video.load();
    });

    video.addEventListener("error", () => {
      if (cancelled) return;
      setFrameError(true);
      setFrameLoading(false);
    });

    video.src = fileUrl;

    return () => {
      cancelled = true;
      video.src = "";
      video.load();
    };
  }, [fileUrl, timestamp, isImage]);

  if (frameError) {
    return (
      <div className="flex items-center gap-2 text-white/30 text-sm">
        <ImageOff className="w-4 h-4" /> Video file unavailable
      </div>
    );
  }

  if (frameLoading) {
    return (
      <div className="flex items-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Extracting frame...
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail — 320px wide */}
      <button onClick={() => setShowModal(true)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frameUrl!}
          alt="Video still frame"
          className="rounded-md border border-white/10 cursor-pointer hover:border-white/30 transition-colors"
          style={{ width: 320, height: "auto" }}
        />
      </button>

      {/* Full-size modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={() => setShowModal(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frameUrl!}
              alt="Video still frame — full size"
              className="rounded-lg max-w-full max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
