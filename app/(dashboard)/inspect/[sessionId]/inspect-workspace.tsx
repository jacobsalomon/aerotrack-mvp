"use client";

// Main inspection workspace — orchestrates section tabs, item list, progress bar.
// Polls for progress updates and manages active section state.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import SectionTabs from "@/components/inspect/section-tabs";
import ItemList from "@/components/inspect/item-list";
import ProgressBar from "@/components/inspect/progress-bar";
import NetworkBanner, { useOnlineStatus } from "@/components/inspect/network-banner";
import NextItemButton from "@/components/inspect/next-item-button";
import ItemSearch from "@/components/inspect/item-search";
import InspectionRecorder from "@/components/inspect/inspection-recorder";
import MeasurementToast, { type MeasurementSuggestion } from "@/components/inspect/measurement-toast";
import {
  matchMeasurementToItem,
  type CandidateItem,
} from "@/lib/inspect/match-measurement-to-item";

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
  user: { id: string; name: string | null; firstName: string | null; lastName: string | null };
  inspectionTemplate: {
    id: string;
    title: string;
    revisionDate: string | null;
    version: number;
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

// Composite key for multi-instance progress: "itemId:instanceIndex"
function progressKey(itemId: string, instanceIndex: number): string {
  return `${itemId}:${instanceIndex}`;
}

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
}

export default function InspectWorkspace({ session, component }: Props) {
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
  const [lastPoll, setLastPoll] = useState<string | null>(null);

  // Summary counts
  const [summary, setSummary] = useState({ total: 0, done: 0, problem: 0, skipped: 0, pending: 0, findings: 0 });

  // Unassigned measurement count
  const [unassignedCount, setUnassignedCount] = useState(0);

  // Measurement suggestions from audio extraction (for toast UI)
  const [suggestions, setSuggestions] = useState<MeasurementSuggestion[]>([]);

  // Photo evidence count from polling
  const [photoCount, setPhotoCount] = useState(0);

  // Build candidate items for measurement matching
  const allCandidates: CandidateItem[] = sections.flatMap((sec) =>
    sec.items.map((item) => ({
      id: item.id,
      sectionId: sec.id,
      parameterName: item.parameterName,
      specUnit: item.specUnit,
      specValueLow: item.specValueLow,
      specValueHigh: item.specValueHigh,
      itemCallout: item.itemCallout,
    }))
  );

  // Get the active section's items filtered by config variant
  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeItems = activeSection?.items.filter((item) => {
    if (!session.configurationVariant) return true;
    if (item.configurationApplicability.length === 0) return true;
    return item.configurationApplicability.includes(session.configurationVariant!);
  }) || [];

  // ── Load full session data (initial + polling) ──
  const fetchSessionData = useCallback(async () => {
    try {
      const url = lastPoll
        ? apiUrl(`/api/inspect/sessions/${session.id}/progress?since=${lastPoll}`)
        : apiUrl(`/api/inspect/sessions/${session.id}`);

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) return;

      if (lastPoll) {
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
      }

      setLastPoll(new Date().toISOString());
    } catch (err) {
      console.error("[InspectWorkspace] polling error:", err);
    }
  }, [session.id, lastPoll]);

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
    // Refresh full data to update section progress + summary
    setTimeout(() => {
      setLastPoll(null); // Force full reload on next poll
    }, 500);
  }

  const [targetItemId, setTargetItemId] = useState<string | null>(null);

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
      try {
        await fetch(apiUrl(`/api/inspect/sessions/${session.id}/glasses-capture`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "measurement",
            value: suggestion.value,
            unit: suggestion.unit,
            confidence: suggestion.match.confidence,
          }),
        });
        // Force a full poll to pick up the new progress
        setLastPoll(null);
      } catch (err) {
        console.error("[InspectWorkspace] accept suggestion failed:", err);
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    },
    [session.id]
  );

  const handleReassignSuggestion = useCallback(
    (_suggestion: MeasurementSuggestion) => {
      // TODO: show item picker for manual assignment
      // For now, just dismiss — the measurement is already stored as unassigned
      setSuggestions((prev) => prev.filter((s) => s.id !== _suggestion.id));
    },
    []
  );

  // Called when InspectionRecorder gets a transcript with measurements
  // The audio pipeline already extracts and stores measurements server-side,
  // so we just need to detect new unassigned ones via polling and show toasts.
  // This is a placeholder for future real-time transcript processing.

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

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <NetworkBanner />

      <ProgressBar
        summary={summary}
        configVariant={session.configurationVariant}
        workOrderRef={session.workOrderRef}
        sessionId={session.id}
        templateTitle={template.title}
        componentInfo={component}
        isReadOnly={isReadOnly}
        unassignedCount={unassignedCount}
        photoCount={photoCount}
        onReview={handleReview}
        recorderSlot={
          !isReadOnly ? <InspectionRecorder sessionId={session.id} /> : undefined
        }
        searchSlot={
          <ItemSearch
            sections={sections}
            progressMap={progressMap}
            onSelect={handleNavigateToItem}
          />
        }
      />

      {/* Section tabs */}
      <SectionTabs
        sections={sections}
        sectionProgress={sectionProgress}
        activeSectionId={activeSectionId}
        onSectionChange={handleSectionChange}
        configVariant={session.configurationVariant}
      />

      {/* Item list for active section */}
      <div className="flex-1 overflow-y-auto">
        <ItemList
          items={activeItems}
          progressMap={progressMap}
          sessionId={session.id}
          sectionId={activeSectionId}
          isReadOnly={isReadOnly}
          isOffline={!isOnline}
          onItemCompleted={handleItemCompleted}
          referenceImageUrls={activeSection?.referenceImageUrls || []}
          targetItemId={targetItemId}
          onTargetItemHandled={() => setTargetItemId(null)}
        />
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
          onAccept={handleAcceptSuggestion}
          onReassign={handleReassignSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}
    </div>
  );
}
