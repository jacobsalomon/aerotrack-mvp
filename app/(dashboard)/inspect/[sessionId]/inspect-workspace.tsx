"use client";

// Main inspection workspace — orchestrates section tabs, item list, progress bar.
// Polls for progress updates and manages active section state.

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import type { PhotoEvidence } from "@/components/inspect/photo-types";
import SectionTabs from "@/components/inspect/section-tabs";
import ItemList from "@/components/inspect/item-list";
import ProgressBar from "@/components/inspect/progress-bar";
import NetworkBanner, { useOnlineStatus } from "@/components/inspect/network-banner";
import NextItemButton from "@/components/inspect/next-item-button";
import ItemSearch from "@/components/inspect/item-search";
import InspectionRecorder, { type TranscriptSegment, type MeasurementHighlight } from "@/components/inspect/inspection-recorder";
import MeasurementToast, { type MeasurementSuggestion } from "@/components/inspect/measurement-toast";
import PdfViewer from "@/components/library/pdf-viewer";
import { QRPairingDialog } from "@/components/qr-pairing-dialog";
import GlassesConnectScreen from "@/components/inspect/glasses-connect-screen";
import { MentraGlassesPanel } from "@/components/inspect/glasses-panel";
import { Glasses } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Types matching what the server component passes down
interface InspectionItem {
  id: string;
  itemType: string;
  itemCallout: string | null;
  parameterName: string;
  specification: string;
  specValueLow: number | null;
  specValueHigh: number | null;
  specUnit: string | null;
  specValueLowMetric: number | null;
  specValueHighMetric: number | null;
  specUnitMetric: string | null;
  toolsRequired: string[];
  checkReference: string | null;
  repairReference: string | null;
  configurationApplicability: string[];
  notes: string | null;
  sortOrder: number;
  instanceCount: number;
  instanceLabels: string[];
}

interface InspectionSection {
  id: string;
  title: string;
  figureNumber: string;
  sortOrder: number;
  pageNumbers: number[];
  referenceImageUrls: string[];
  itemCount: number;
  configurationApplicability: string[];
  items: InspectionItem[];
}

interface SessionData {
  id: string;
  sessionType: string;
  status: string;
  componentId: string | null;
  configurationVariant: string | null;
  workOrderRef: string | null;
  activeInspectionSectionId: string | null;
  signedOffAt: string | null;
  startedAt: string;
  inspectionTemplateId: string | null;
  inspectionTemplateVersion: number | null;
  pairingCode: string | null;
  pairingCodeExpiresAt: string | null;
  user: { id: string; name: string | null; firstName: string | null; lastName: string | null };
  inspectionTemplate: {
    id: string;
    title: string;
    createdAt: string;
    revisionDate: string | null;
    version: number;
    sourceFileUrl: string | null;
    sections: InspectionSection[];
  } | null;
}

interface ComponentData {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
}

// Progress data from polling
interface ProgressRecord {
  inspectionItemId: string;
  instanceIndex: number;
  status: string;
  result: string | null;
  measurementId: string | null;
  measurement: {
    id: string;
    value: number;
    unit: string;
    inTolerance: boolean | null;
    status: string;
  } | null;
}

import { progressKey } from "@/lib/inspect/cmm-config";

// Section progress from summary
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

interface Props {
  session: SessionData;
  component: ComponentData | null;
  justStarted?: boolean;
}

export default function InspectWorkspace({ session, component, justStarted }: Props) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const template = session.inspectionTemplate;
  const sections = template?.sections || [];
  const isReadOnly = !!session.signedOffAt;

  // Active section
  const [activeSectionId, setActiveSectionId] = useState<string>(
    session.activeInspectionSectionId || sections[0]?.id || ""
  );

  // Progress map: itemId → progress record
  const [progressMap, setProgressMap] = useState<Map<string, ProgressRecord>>(new Map());
  const [sectionProgress, setSectionProgress] = useState<SectionProgressData[]>([]);
  const lastPollRef = useRef<string | null>(null);

  // Summary counts
  const [summary, setSummary] = useState({ total: 0, done: 0, problem: 0, skipped: 0, pending: 0, findings: 0 });

  // Unassigned measurement count
  const [unassignedCount, setUnassignedCount] = useState(0);

  // QR pairing dialog
  const [showPairing, setShowPairing] = useState(false);
  const [showMentraPanel, setShowMentraPanel] = useState(false);
  const [glassesPaired, setGlassesPaired] = useState(
    !session.pairingCode && !!session.pairingCodeExpiresAt
  );

  // Full-screen connect step — shown when inspection just started without glasses
  const [showConnectScreen, setShowConnectScreen] = useState(
    !!justStarted && !(!session.pairingCode && !!session.pairingCodeExpiresAt)
  );

  // Stable callbacks for connect screen — must not change identity
  // or the auto-transition timer resets on every poll-driven re-render
  const handleGlassesConnected = useCallback(() => {
    setGlassesPaired(true);
    setShowConnectScreen(false);
  }, []);

  const handleConnectSkip = useCallback(() => {
    setShowConnectScreen(false);
  }, []);

  // Mobile diagram viewer
  const [showDiagram, setShowDiagram] = useState(false);

  // Measurement suggestions from audio extraction (for toast UI)
  const [suggestions, setSuggestions] = useState<MeasurementSuggestion[]>([]);

  // Items that were auto-accepted — flash green briefly then clear
  const [autoAcceptedItemIds, setAutoAcceptedItemIds] = useState<Set<string>>(new Set());

  // Photo evidence count from polling (ref tracks latest for stale-closure comparison)
  const [photoCount, setPhotoCount] = useState(0);
  const photoCountRef = useRef(0);

  // Photo evidence map: inspectionItemId (or "general") → array of photos
  const [photoMap, setPhotoMap] = useState<Map<string, PhotoEvidence[]>>(new Map());

  // Transcript chunks per item: itemId → array of transcript strings (newest first)
  // "__unmatched__" key holds transcripts captured when no item is expanded
  const [transcriptMap, setTranscriptMap] = useState<Map<string, string[]>>(new Map());
  const activeExpandedItemRef = useRef<string | null>(null);

  // Callback for ItemList to report which item is currently expanded
  const handleExpandedItemChange = useCallback((itemId: string | null) => {
    activeExpandedItemRef.current = itemId;
  }, []);

  // Fallback for when AI splitting isn't available — put transcript on expanded item
  const handleTranscript = useCallback((text: string) => {
    if (!text.trim()) return;
    const key = activeExpandedItemRef.current || "__unmatched__";
    setTranscriptMap((prev) => {
      const next = new Map(prev);
      const chunks = next.get(key) || [];
      next.set(key, [text, ...chunks]); // newest first
      return next;
    });
  }, []);

  // Callback for AI-split transcript segments — each segment goes to the right item
  const handleTranscriptSegments = useCallback((segments: TranscriptSegment[]) => {
    setTranscriptMap((prev) => {
      const next = new Map(prev);
      for (const seg of segments) {
        if (!seg.text.trim()) continue;
        const key = seg.inspectionItemId || "__unmatched__";
        const chunks = next.get(key) || [];
        next.set(key, [seg.text, ...chunks]); // newest first
      }
      return next;
    });
  }, []);

  // Measurement highlights — excerpts to highlight within transcript text
  // Keyed by item ID (or "__unmatched__"), value is array of rawExcerpt strings
  const [highlightMap, setHighlightMap] = useState<Map<string, string[]>>(new Map());

  const handleMeasurementHighlights = useCallback((highlights: MeasurementHighlight[]) => {
    setHighlightMap((prev) => {
      const next = new Map(prev);
      for (const h of highlights) {
        const key = h.itemId || "__unmatched__";
        const arr = next.get(key) || [];
        if (!arr.includes(h.rawExcerpt)) {
          next.set(key, [...arr, h.rawExcerpt]);
        }
      }
      return next;
    });
  }, []);

  // Get the active section's items filtered by config variant
  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeItems = activeSection?.items.filter((item) => {
    if (!session.configurationVariant) return true;
    if (item.configurationApplicability.length === 0) return true;
    return item.configurationApplicability.includes(session.configurationVariant!);
  }) || [];

  // ── Load full session data (initial + polling) ──
  // Uses a ref for lastPoll so the callback identity stays stable (no interval churn)
  const fetchSessionData = useCallback(async () => {
    try {
      const lp = lastPollRef.current;
      const url = lp
        ? apiUrl(`/api/inspect/sessions/${session.id}/progress?since=${lp}`)
        : apiUrl(`/api/inspect/sessions/${session.id}`);

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) return;

      if (lp) {
        // Incremental update from progress endpoint
        const updates: ProgressRecord[] = data.data;
        if (updates.length > 0) {
          setProgressMap((prev) => {
            const next = new Map(prev);
            for (const p of updates) {
              next.set(progressKey(p.inspectionItemId, p.instanceIndex ?? 0), p);
            }
            return next;
          });
        }
        // Update photo count; re-fetch photo list if count changed (e.g., glasses photos arrived)
        if (data.photoCount != null) {
          const countChanged = data.photoCount !== photoCountRef.current;
          setPhotoCount(data.photoCount);
          photoCountRef.current = data.photoCount;
          if (countChanged) {
            try {
              const photoRes = await fetch(apiUrl(`/api/inspect/sessions/${session.id}/photos`));
              const photoData = await photoRes.json();
              if (photoRes.ok && photoData.success) {
                const newPhotoMap = new Map<string, PhotoEvidence[]>();
                for (const photo of photoData.data) {
                  const key = photo.inspectionItemId || "general";
                  const arr = newPhotoMap.get(key) || [];
                  arr.push(photo);
                  newPhotoMap.set(key, arr);
                }
                setPhotoMap(newPhotoMap);
              }
            } catch { /* non-critical */ }
          }
        }
      } else {
        // Full load from session endpoint
        const fullData = data.data;
        const newMap = new Map<string, ProgressRecord>();
        for (const p of fullData.session.inspectionProgress || []) {
          const idx = p.instanceIndex ?? 0;
          newMap.set(progressKey(p.inspectionItemId, idx), {
            inspectionItemId: p.inspectionItemId,
            instanceIndex: idx,
            status: p.status,
            result: p.result,
            measurementId: p.measurementId,
            measurement: p.measurement,
          });
        }
        setProgressMap(newMap);
        setSectionProgress(fullData.sectionProgress || []);
        setSummary(fullData.summary || { total: 0, done: 0, problem: 0, skipped: 0, pending: 0, findings: 0 });
        setUnassignedCount(fullData.unassignedMeasurements?.length || 0);
        setPhotoCount(fullData.photoCount || 0);
        photoCountRef.current = fullData.photoCount || 0;

        // Sync glasses paired status from server
        const serverPaired = !fullData.session.pairingCode && !!fullData.session.pairingCodeExpiresAt;
        setGlassesPaired(serverPaired);

        // Fetch photos for this session
        try {
          const photoRes = await fetch(apiUrl(`/api/inspect/sessions/${session.id}/photos`));
          const photoData = await photoRes.json();
          if (photoRes.ok && photoData.success) {
            const newPhotoMap = new Map<string, PhotoEvidence[]>();
            for (const photo of photoData.data) {
              const key = photo.inspectionItemId || "general";
              const arr = newPhotoMap.get(key) || [];
              arr.push(photo);
              newPhotoMap.set(key, arr);
            }
            setPhotoMap(newPhotoMap);
          }
        } catch { /* non-critical — photos will load on next poll */ }
      }

      lastPollRef.current = new Date().toISOString();
    } catch (err) {
      console.error("[InspectWorkspace] polling error:", err);
    }
  }, [session.id]);

  // Initial load
  useEffect(() => {
    fetchSessionData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for updates every 3 seconds
  useEffect(() => {
    if (isReadOnly) return;
    const interval = setInterval(fetchSessionData, 3000);
    return () => clearInterval(interval);
  }, [fetchSessionData, isReadOnly]);

  // ── Section switch ──
  async function handleSectionChange(sectionId: string) {
    setActiveSectionId(sectionId);
    // Persist active section to server
    try {
      await fetch(apiUrl(`/api/inspect/sessions/${session.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeInspectionSectionId: sectionId }),
      });
    } catch {
      // Non-critical — best effort
    }
  }

  // ── Item completion callback (called from ItemList) ──
  function handleItemCompleted(itemId: string, status: string, result: string | null, measurement: ProgressRecord["measurement"], instanceIndex = 0) {
    setProgressMap((prev) => {
      const next = new Map(prev);
      next.set(progressKey(itemId, instanceIndex), { inspectionItemId: itemId, instanceIndex, status, result, measurementId: measurement?.id || null, measurement });
      return next;
    });
    // Force full reload on next poll to update section progress + summary
    setTimeout(() => {
      lastPollRef.current = null;
    }, 500);
  }

  // Called when a photo is reassigned from the Unmatched section
  const handlePhotoReassigned = useCallback(async (evidenceId: string, newItemId: string) => {
    // Optimistic UI update: move the photo from "general" to the target item
    setPhotoMap((prev) => {
      const next = new Map(prev);
      const general = [...(next.get("general") || [])];
      const photoIdx = general.findIndex((p) => p.id === evidenceId);
      if (photoIdx === -1) return prev;
      const [photo] = general.splice(photoIdx, 1);
      next.set("general", general);
      const target = [...(next.get(newItemId) || []), { ...photo, inspectionItemId: newItemId }];
      next.set(newItemId, target);
      return next;
    });
    // Persist to server
    try {
      await fetch(apiUrl(`/api/inspect/sessions/${session.id}/photos`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId, inspectionItemId: newItemId }),
      });
    } catch (err) {
      console.error("[InspectWorkspace] photo reassign failed:", err);
    }
  }, [session.id]);

  // Called when a photo is uploaded from ItemList
  function handlePhotoUploaded(photo: PhotoEvidence) {
    const key = photo.inspectionItemId || "general";
    setPhotoMap((prev) => {
      const next = new Map(prev);
      const arr = [...(next.get(key) || []), photo];
      next.set(key, arr);
      return next;
    });
    setPhotoCount((prev) => {
      const newCount = prev + 1;
      photoCountRef.current = newCount;
      return newCount;
    });
  }

  const [targetItemId, setTargetItemId] = useState<string | null>(null);

  // PDF state — source document URL and which page to scroll to
  const sourceFileUrl = template?.sourceFileUrl || null;
  const activeSectionPages = activeSection?.pageNumbers || [];
  const [scrollToPage, setScrollToPage] = useState<number | undefined>(undefined);

  // Scroll to first page of the active section when section changes
  useEffect(() => {
    if (activeSectionPages.length > 0) {
      setScrollToPage(activeSectionPages[0]);
    }
  }, [activeSectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigate to review ──
  function handleReview() {
    router.push(`/jobs/${session.id}/review`);
  }

  // ── Measurement toast handlers ──
  const handleDismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleAcceptSuggestion = useCallback(
    async (suggestion: MeasurementSuggestion) => {
      if (!suggestion.match) return;
      // Accept = record this measurement for the matched item via the glasses-capture API
      // Send the matched itemId so the server doesn't re-run matching (avoids race conditions)
      try {
        await fetch(apiUrl(`/api/inspect/sessions/${session.id}/glasses-capture`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "measurement",
            value: suggestion.value,
            unit: suggestion.unit,
            confidence: suggestion.match.confidence,
            assignToItemId: suggestion.match.itemId,
          }),
        });
        // Force a full poll to pick up the new progress
        lastPollRef.current = null;
      } catch (err) {
        console.error("[InspectWorkspace] accept suggestion failed:", err);
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    },
    [session.id]
  );

  const handleReassignSuggestion = useCallback(
    async (suggestion: MeasurementSuggestion, targetItemId: string) => {
      // Reassign this measurement to the chosen target item via the glasses-capture API
      try {
        await fetch(apiUrl(`/api/inspect/sessions/${session.id}/glasses-capture`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "measurement",
            value: suggestion.value,
            unit: suggestion.unit,
            confidence: suggestion.match?.confidence ?? 0,
            assignToItemId: targetItemId,
          }),
        });
        // Force a full poll to pick up the new progress
        lastPollRef.current = null;
      } catch (err) {
        console.error("[InspectWorkspace] reassign suggestion failed:", err);
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    },
    [session.id]
  );

  // Auto-accept threshold: 90%+ confidence measurements skip the toast
  const AUTO_ACCEPT_CONFIDENCE = 0.9;

  // Add a suggestion — auto-accepts if confidence is high enough, otherwise shows toast
  const addSuggestion = useCallback(
    (suggestion: MeasurementSuggestion) => {
      if (suggestion.match && suggestion.match.confidence >= AUTO_ACCEPT_CONFIDENCE) {
        // High confidence — accept automatically and flash the item row green
        handleAcceptSuggestion(suggestion);
        setAutoAcceptedItemIds((prev) => {
          const next = new Set(prev);
          next.add(suggestion.match!.itemId);
          return next;
        });
        // Clear the flash after 2 seconds
        setTimeout(() => {
          setAutoAcceptedItemIds((prev) => {
            const next = new Set(prev);
            next.delete(suggestion.match!.itemId);
            return next;
          });
        }, 2000);
      } else {
        // Below threshold — show toast for manual review
        setSuggestions((prev) => [...prev, suggestion]);
      }
    },
    [handleAcceptSuggestion]
  );

  function handleNavigateToItem(sectionId: string, itemId: string) {
    if (sectionId !== activeSectionId) {
      handleSectionChange(sectionId);
    }
    setTargetItemId(itemId);
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50">
        No template linked to this session.
      </div>
    );
  }

  // Full-screen connect step — shown before workspace when glasses aren't connected
  if (showConnectScreen) {
    return (
      <GlassesConnectScreen
        sessionId={session.id}
        onPaired={handleGlassesConnected}
        onSkip={handleConnectSkip}
        onUseMentra={() => {
          setShowConnectScreen(false);
          setShowMentraPanel(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 -mx-4 -mb-8 -mt-20 sm:-mx-6 lg:-mx-8 lg:-mt-8">
      <NetworkBanner />

      {/* Persistent banner when glasses not connected */}
      {!glassesPaired && !isReadOnly && (
        <div className="w-full bg-emerald-950/50 border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Glasses className="h-5 w-5 text-emerald-400/70" />
            <span className="text-sm font-medium text-emerald-300/80">
              Glasses not connected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMentraPanel(true)}
              className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10"
            >
              Mentra Mini
            </button>
            <button
              onClick={() => setShowPairing(true)}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white"
            >
              Meta / QR
            </button>
          </div>
        </div>
      )}

      <ProgressBar
        summary={summary}
        configVariant={session.configurationVariant}
        workOrderRef={session.workOrderRef}
        sessionId={session.id}
        templateTitle={template.title}
        templateCreatedAt={template.createdAt}
        componentInfo={component}
        isReadOnly={isReadOnly}
        unassignedCount={unassignedCount}
        glassesPaired={glassesPaired}
        onPairGlasses={() => setShowPairing(true)}
        photoCount={photoCount}
        onReview={handleReview}
        recorderSlot={
          !isReadOnly ? <InspectionRecorder sessionId={session.id} onTranscript={handleTranscript} onTranscriptSegments={handleTranscriptSegments} onMeasurementHighlights={handleMeasurementHighlights} /> : undefined
        }
        searchSlot={
          <ItemSearch
            sections={sections}
            progressMap={progressMap}
            onSelect={handleNavigateToItem}
          />
        }
      />

      {!isReadOnly && (
        <div className="border-b border-white/10 bg-zinc-950/70 px-4 py-2 flex justify-end">
          <button
            onClick={() => setShowMentraPanel(true)}
            className="rounded-md border border-emerald-500/35 px-3 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10"
          >
            {glassesPaired ? "Manage Mentra" : "Connect Mentra"}
          </button>
        </div>
      )}

      {/* Section tabs */}
      <SectionTabs
        sections={sections}
        sectionProgress={sectionProgress}
        activeSectionId={activeSectionId}
        onSectionChange={handleSectionChange}
        configVariant={session.configurationVariant}
      />

      {/* Mobile "View Diagram" button — shows on small screens when a PDF exists */}
      {sourceFileUrl && (
        <div className="lg:hidden border-b border-white/10 px-4 py-2">
          <button
            onClick={() => setShowDiagram(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/5 border border-white/15 text-white/70 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            View CMM Diagram
          </button>
        </div>
      )}

      {/* Split view: source document on left, items on right (large screens) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Source document viewer — scrollable PDF, visible on large screens */}
        {sourceFileUrl && (
          <div className="hidden lg:flex lg:w-1/2 flex-col border-r border-white/10">
            <PdfViewer
              fileUrl={sourceFileUrl}
              mode="scroll"
              scrollToPage={scrollToPage}
            />
          </div>
        )}

        {/* Item list — pb-24 prevents floating "Next" button from covering items */}
        <div className={`overflow-y-auto pb-24 ${sourceFileUrl ? "w-full lg:w-1/2" : "w-full"}`}>
          <ItemList
            items={activeItems}
            progressMap={progressMap}
            photoMap={photoMap}
            transcriptMap={transcriptMap}
            highlightMap={highlightMap}
            sessionId={session.id}
            isReadOnly={isReadOnly}
            isOffline={!isOnline}
            onItemCompleted={handleItemCompleted}
            onPhotoUploaded={handlePhotoUploaded}
            onPhotoReassigned={handlePhotoReassigned}
            onExpandedItemChange={handleExpandedItemChange}
            referenceImageUrls={activeSection?.referenceImageUrls || []}
            targetItemId={targetItemId}
            onTargetItemHandled={() => setTargetItemId(null)}
            autoAcceptedItemIds={autoAcceptedItemIds}
          />
        </div>
      </div>

      {!isReadOnly && (
        <NextItemButton
          sections={sections}
          activeSectionId={activeSectionId}
          progressMap={progressMap}
          onNavigate={handleNavigateToItem}
          disabled={!isOnline}
        />
      )}

      {/* Measurement suggestion toasts — bottom of screen */}
      {!isReadOnly && (
        <MeasurementToast
          suggestions={suggestions}
          reassignableItems={sections.flatMap((s) =>
            s.items.map((i) => ({ id: i.id, itemCallout: i.itemCallout, parameterName: i.parameterName }))
          )}
          onAccept={handleAcceptSuggestion}
          onReassign={handleReassignSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}

      {/* QR pairing dialog */}
      <QRPairingDialog
        sessionId={session.id}
        open={showPairing}
        onOpenChange={setShowPairing}
        onPaired={handleGlassesConnected}
      />

      <Dialog open={showMentraPanel} onOpenChange={setShowMentraPanel}>
        <DialogContent className="sm:max-w-lg border-white/10 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle>Connect Mentra Glasses</DialogTitle>
          </DialogHeader>
          <MentraGlassesPanel
            sessionId={session.id}
            onPaired={handleGlassesConnected}
          />
        </DialogContent>
      </Dialog>

      {/* Mobile diagram modal — full-screen overlay with the CMM PDF */}
      {showDiagram && sourceFileUrl && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-white font-medium">CMM Diagram</span>
            <button
              onClick={() => setShowDiagram(false)}
              className="text-white/60 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <PdfViewer
              fileUrl={sourceFileUrl}
              mode="scroll"
              scrollToPage={scrollToPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}
