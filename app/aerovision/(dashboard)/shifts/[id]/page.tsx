"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileDown,
  Gauge,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MeasurementFeed } from "@/components/measurement-feed";
import { SpecProgress } from "@/components/spec-progress";
import {
  ShiftDeskMicRecorder,
  type ShiftDeskMicRecorderHandle,
} from "@/components/shift-desk-mic-recorder";
import { apiUrl } from "@/lib/api-url";
import {
  normalizeShiftTranscript,
  transcriptHasUnresolvedConflictMarkers,
} from "@/lib/shift-transcript";
import { useSmartPoll } from "@/lib/use-smart-poll";
import { PollStatusBadge } from "@/components/poll-status-badge";

interface ShiftDetail {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalDurationMin: number | null;
  notes: string | null;
  transcriptReviewStatus: string;
  transcriptApprovedAt: string | null;
  transcriptApprovedBy: string | null;
  transcriptUpdatedAt: string | null;
  quantumExportedAt: string | null;
  transcriptText: string;
  transcriptAutoText: string;
  transcriptPendingReview: boolean;
  transcriptSources: Array<{
    source: string;
    label: string;
    chunkCount: number;
    transcriptText: string;
    latestAt: string | null;
  }>;
  transcriptSegments: Array<{
    id: string;
    startedAt: string | null;
    endedAt: string | null;
    status: "single_source" | "agreed" | "conflict";
    displayText: string;
    sources: string[];
    contributions: Array<{
      source: string;
      label: string;
      transcript: string;
    }>;
  }>;
  transcriptValidation: {
    distinctSources: number;
    totalSegments: number;
    multiSourceSegments: number;
    agreedSegments: number;
    conflictingSegments: number;
    singleSourceSegments: number;
  };
  technician: { firstName: string; lastName: string; badgeNumber: string };
  measurementSpec: { specItemsJson: string; name: string } | null;
  specItems: unknown[] | null;
  measurementStatusCounts: Record<string, number>;
  _count: { measurements: number; captureSessions: number; transcriptChunks: number };
}

const MEASUREMENT_TYPE_OPTIONS = [
  { value: "dimension", label: "Dimension", suggestedUnit: "in" },
  { value: "torque", label: "Torque", suggestedUnit: "ft-lbs" },
  { value: "clearance", label: "Clearance", suggestedUnit: "mils" },
  { value: "pressure", label: "Pressure", suggestedUnit: "psi" },
  { value: "temperature", label: "Temperature", suggestedUnit: "degF" },
  { value: "runout", label: "Runout", suggestedUnit: "in" },
  { value: "endplay", label: "End Play", suggestedUnit: "mils" },
  { value: "backlash", label: "Backlash", suggestedUnit: "in" },
  { value: "weight", label: "Weight", suggestedUnit: "lb" },
  { value: "rpm", label: "RPM", suggestedUnit: "rpm" },
  { value: "resistance", label: "Resistance", suggestedUnit: "ohms" },
] as const;

type MeasurementType = (typeof MEASUREMENT_TYPE_OPTIONS)[number]["value"];

const DEFAULT_MEASUREMENT_TYPE = MEASUREMENT_TYPE_OPTIONS[0].value;

export default function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deskMicRecorderRef = useRef<ShiftDeskMicRecorderHandle | null>(null);
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [shiftAction, setShiftAction] = useState<"pause" | "resume" | "reconcile" | null>(null);
  const [shiftActionError, setShiftActionError] = useState<string | null>(null);
  const [transcriptAction, setTranscriptAction] = useState<"save" | "approve" | null>(null);
  const [transcriptEditor, setTranscriptEditor] = useState("");
  const [transcriptDirty, setTranscriptDirty] = useState(false);
  const [transcriptEditorBaseUpdatedAt, setTranscriptEditorBaseUpdatedAt] = useState<string | null>(
    null
  );
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [measurementForm, setMeasurementForm] = useState<{
    measurementType: MeasurementType;
    parameterName: string;
    value: string;
    unit: string;
    procedureStep: string;
    taskCardRef: string;
  }>({
    measurementType: DEFAULT_MEASUREMENT_TYPE,
    parameterName: "",
    value: "",
    unit: MEASUREMENT_TYPE_OPTIONS[0].suggestedUnit,
    procedureStep: "",
    taskCardRef: "",
  });
  const [measurementSubmitting, setMeasurementSubmitting] = useState(false);
  const [measurementMessage, setMeasurementMessage] = useState<string | null>(null);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [specProgress, setSpecProgress] = useState<{
    specName: string;
    totalRequired: number;
    capturedRequired: number;
    items: Array<{
      parameterName: string;
      measurementType: string;
      unit: string;
      required?: boolean;
      index: number;
      captured: boolean;
      measurement: { status: string; inTolerance: boolean | null } | null;
    }>;
  } | null>(null);

  const handleExpiredDashboardSession = useCallback((response: Response) => {
    if (response.status !== 401) return false;
    sessionStorage.removeItem("demo-unlocked");
    window.location.reload();
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadShift = async () => {
      try {
        const res = await fetch(apiUrl(`/api/shifts/${id}`));
        if (handleExpiredDashboardSession(res)) return;
        const data = await res.json();
        if (!cancelled && data.success) {
          setShift(data.data);
        }
      } catch (error) {
        console.error("Load shift error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadShift();
    return () => {
      cancelled = true;
    };
  }, [handleExpiredDashboardSession, id]);

  useEffect(() => {
    if (!shift || !transcriptDirty) {
      setTranscriptEditor(shift?.transcriptText ?? "");
      setTranscriptEditorBaseUpdatedAt(shift?.transcriptUpdatedAt ?? null);
    }
  }, [shift?.id, shift?.transcriptText, shift?.transcriptUpdatedAt, transcriptDirty]);

  // Smart polling for shift data: backs off from 2s to 30s, resets on status change
  const shouldPollShift = !!(
    shift &&
    (
      shift.status === "active" ||
      shift.status === "paused" ||
      shift.status === "reconciling" ||
      (shift.status === "completed" && shift.transcriptReviewStatus !== "approved")
    )
  );

  const shiftPollFn = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/shifts/${id}`));
      if (handleExpiredDashboardSession(res)) return;
      const data = await res.json();
      if (data.success) {
        setShift(data.data);
      }
    } catch (error) {
      console.error("Shift poll error:", error);
    }
  }, [handleExpiredDashboardSession, id]);

  const shiftPoll = useSmartPoll({
    pollFn: shiftPollFn,
    enabled: shouldPollShift,
    initialIntervalMs: 2000,
    maxIntervalMs: 30000,
    backoffFactor: 1.5,
    resetKey: `${shift?.status}-${shift?.transcriptReviewStatus}`,
  });

  // Smart polling for spec/measurement progress (only while shift is active)
  const shouldPollSpec = !!(shift && (shift.status === "active" || shift.status === "paused"));

  const specPollFn = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/shifts/${id}/measurements`));
      if (handleExpiredDashboardSession(res)) return;
      const data = await res.json();
      if (data.success && data.specProgress) {
        setSpecProgress(data.specProgress);
      }
    } catch (error) {
      console.error("Spec poll error:", error);
    }
  }, [handleExpiredDashboardSession, id]);

  // Initial spec load
  useEffect(() => {
    if (shouldPollSpec) {
      void specPollFn();
    }
  }, [shouldPollSpec, specPollFn]);

  useSmartPoll({
    pollFn: specPollFn,
    enabled: shouldPollSpec,
    initialIntervalMs: 2000,
    maxIntervalMs: 30000,
    backoffFactor: 1.5,
    resetKey: shift?.status ?? null,
  });

  const refreshShift = async () => {
    const shiftRes = await fetch(apiUrl(`/api/shifts/${id}`));
    if (handleExpiredDashboardSession(shiftRes)) return null;
    const shiftData = await shiftRes.json();
    if (shiftData.success) {
      setShift(shiftData.data);
      return shiftData.data as ShiftDetail;
    }
    return null;
  };

  const resetMeasurementForm = (
    measurementType: MeasurementType = DEFAULT_MEASUREMENT_TYPE,
    unit: string = MEASUREMENT_TYPE_OPTIONS[0].suggestedUnit
  ) => {
    setMeasurementForm({
      measurementType,
      parameterName: "",
      value: "",
      unit,
      procedureStep: "",
      taskCardRef: "",
    });
  };

  const handleShiftStateAction = async (action: "pause" | "resume") => {
    setShiftAction(action);
    setShiftActionError(null);

    try {
      const res = await fetch(apiUrl(`/api/shifts/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (handleExpiredDashboardSession(res)) return;
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${action} shift`);
      }

      await refreshShift();
    } catch (error) {
      setShiftActionError(
        error instanceof Error ? error.message : `Failed to ${action} shift`
      );
    } finally {
      setShiftAction(null);
    }
  };

  const handleReconcile = async () => {
    setShiftAction("reconcile");
    setShiftActionError(null);
    try {
      if (deskMicRecorderRef.current?.isRecording()) {
        await deskMicRecorderRef.current.stopAndFlush();
      }

      const res = await fetch(apiUrl(`/api/shifts/${id}/reconcile`), { method: "POST" });
      if (handleExpiredDashboardSession(res)) return;
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reconcile shift");
      }

      await refreshShift();
    } catch (error) {
      setShiftActionError(
        error instanceof Error ? error.message : "Failed to reconcile shift"
      );
    } finally {
      setShiftAction(null);
    }
  };

  const handleManualMeasurementSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMeasurementError(null);
    setMeasurementMessage(null);

    if (!measurementForm.parameterName.trim()) {
      setMeasurementError("Add a short name so the team knows what was measured.");
      return;
    }

    if (!measurementForm.value.trim()) {
      setMeasurementError("Enter the measured value before saving.");
      return;
    }

    if (!measurementForm.unit.trim()) {
      setMeasurementError("Enter the unit for this reading.");
      return;
    }

    const numericValue = Number.parseFloat(measurementForm.value);
    if (Number.isNaN(numericValue)) {
      setMeasurementError("Use a number for the reading value.");
      return;
    }

    setMeasurementSubmitting(true);

    try {
      const res = await fetch(apiUrl(`/api/shifts/${id}/measurements`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measurementType: measurementForm.measurementType,
          parameterName: measurementForm.parameterName.trim(),
          value: numericValue,
          unit: measurementForm.unit.trim(),
          procedureStep: measurementForm.procedureStep.trim() || undefined,
          taskCardRef: measurementForm.taskCardRef.trim() || undefined,
        }),
      });
      if (handleExpiredDashboardSession(res)) return;

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save measurement");
      }

      resetMeasurementForm(measurementForm.measurementType, measurementForm.unit.trim());
      setMeasurementMessage(
        "Measurement saved. It will appear in the live feed in a moment."
      );
      await refreshShift();
    } catch (error) {
      setMeasurementError(
        error instanceof Error ? error.message : "Failed to save measurement"
      );
    } finally {
      setMeasurementSubmitting(false);
    }
  };

  const handleTranscriptAction = async (action: "save" | "approve") => {
    setTranscriptAction(action);
    setTranscriptError(null);

    try {
      const res = await fetch(apiUrl(`/api/shifts/${id}/transcript`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          transcript: transcriptEditor,
          lastKnownTranscriptUpdatedAt: transcriptEditorBaseUpdatedAt,
        }),
      });
      if (handleExpiredDashboardSession(res)) return;

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 409 && data.staleTranscript) {
          setTranscriptDirty(false);
          await refreshShift();
        }
        throw new Error(data.error || "Failed to update transcript");
      }

      setTranscriptDirty(false);
      await refreshShift();
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : "Failed to update transcript");
    } finally {
      setTranscriptAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!shift) {
    return <div className="py-20 text-center text-slate-500">Shift not found</div>;
  }

  const isActive = shift.status === "active";
  const isPaused = shift.status === "paused";
  const isCompleted = shift.status === "completed";
  const startDate = new Date(shift.startedAt);
  const normalizedTranscriptEditor = normalizeShiftTranscript(transcriptEditor);
  const normalizedAutoTranscript = normalizeShiftTranscript(shift.transcriptAutoText);
  const transcriptHasText = normalizedTranscriptEditor.length > 0;
  const quantumReady =
    isCompleted &&
    shift.transcriptReviewStatus === "approved" &&
    shift.transcriptText.trim().length > 0;
  const transcriptStatusLabel =
    shift.transcriptReviewStatus === "approved"
      ? "Approved for Quantum"
      : shift.transcriptReviewStatus === "review_required"
        ? "Review required"
        : "Capturing live";
  const transcriptConflictSegments = shift.transcriptSegments.filter(
    (segment) => segment.status === "conflict"
  );
  const transcriptSingleSourceSegments = shift.transcriptSegments.filter(
    (segment) => segment.status === "single_source"
  );
  const transcriptValidationTone =
    transcriptConflictSegments.length > 0
      ? "border-amber-300 bg-amber-50/60"
      : shift.transcriptValidation.agreedSegments > 0
        ? "border-green-200 bg-green-50/40"
        : "border-slate-200 bg-slate-50/50";
  const transcriptValidationSummary =
    transcriptConflictSegments.length > 0
      ? "Some note windows disagree across sources and need a quick technician check."
      : shift.transcriptValidation.agreedSegments > 0
        ? "AeroVision is seeing corroboration between sources, which is exactly what we want for confidence."
        : "Notes are still coming from a single source, so confidence is improving but not yet corroborated.";
  const approvalBlockedByConflict =
    isCompleted &&
    transcriptConflictSegments.length > 0 &&
    (normalizedTranscriptEditor === normalizedAutoTranscript ||
      transcriptHasUnresolvedConflictMarkers(normalizedTranscriptEditor));
  const transcriptEditorIsStale =
    isCompleted &&
    (shift.transcriptUpdatedAt ?? null) !== (transcriptEditorBaseUpdatedAt ?? null);
  const approvalBlocked =
    !transcriptHasText || approvalBlockedByConflict || transcriptEditorIsStale;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/shifts">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Shifts
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {shift.technician.firstName} {shift.technician.lastName}&apos;s Shift
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-500">
                {startDate.toLocaleDateString()}{" "}
                {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {shift.totalDurationMin &&
                  ` · ${Math.floor(shift.totalDurationMin / 60)}h ${shift.totalDurationMin % 60}m`}
              </p>
              <PollStatusBadge poll={shiftPoll} isPolling={shouldPollShift} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              disabled={shiftAction !== null}
              onClick={() => void handleShiftStateAction("pause")}
            >
              {shiftAction === "pause" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Pause className="mr-1 h-4 w-4" />
              )}
              Pause
            </Button>
          )}
          {isPaused && (
            <Button
              variant="outline"
              size="sm"
              disabled={shiftAction !== null}
              onClick={() => void handleShiftStateAction("resume")}
            >
              {shiftAction === "resume" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Resume
            </Button>
          )}
          {(isActive || isPaused) && (
            <Button
              variant="destructive"
              size="sm"
              disabled={shiftAction !== null}
              onClick={() => void handleReconcile()}
            >
              {shiftAction === "reconcile" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-1 h-4 w-4" />
              )}
              End & Reconcile
            </Button>
          )}
          {isCompleted && quantumReady ? (
            <a href={apiUrl(`/api/shifts/${id}/export`)} download>
              <Button variant="outline" size="sm">
                <FileDown className="mr-1 h-4 w-4" />
                Export for Quantum
              </Button>
            </a>
          ) : isCompleted ? (
            <Button variant="outline" size="sm" disabled>
              <FileDown className="mr-1 h-4 w-4" />
              Approve Transcript First
            </Button>
          ) : null}
        </div>
      </div>

      {shiftActionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {shiftActionError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Gauge className="h-4 w-4" />
              Status
            </div>
            <p className="mt-1 text-lg font-semibold capitalize">{shift.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CheckCircle2 className="h-4 w-4" />
              Measurements
            </div>
            <p className="mt-1 text-lg font-semibold">{shift._count.measurements}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Mic className="h-4 w-4" />
              Transcript
            </div>
            <p className="mt-1 text-lg font-semibold">{transcriptStatusLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              {shift._count.transcriptChunks} live chunk{shift._count.transcriptChunks === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              Duration
            </div>
            <p className="mt-1 text-lg font-semibold">
              {shift.totalDurationMin
                ? `${Math.floor(shift.totalDurationMin / 60)}h ${shift.totalDurationMin % 60}m`
                : "In progress"}
            </p>
          </CardContent>
        </Card>
      </div>

      {shift.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Work Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{shift.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card className={shift.transcriptReviewStatus === "review_required" ? "border-amber-300 bg-amber-50/40" : ""}>
        <CardHeader>
          <CardTitle className="text-base">Transcript Review</CardTitle>
          <p className="text-sm text-slate-500">
            {isCompleted
              ? "AeroVision captured continuously in the background. Review these notes before Quantum export is unlocked."
              : "AeroVision is merging desk-mic and capture-device notes live. Quantum stays blocked until capture stops and the technician approves the transcript."}
          </p>
        </CardHeader>
          <CardContent className="space-y-4">
            <div className={`rounded-xl border p-4 ${transcriptValidationTone}`}>
              <div className="grid gap-3 md:grid-cols-4">
                <ValidationMetric
                  label="Sources"
                  value={shift.transcriptValidation.distinctSources}
                  helper="Active transcript lanes"
                />
                <ValidationMetric
                  label="Agreed"
                  value={shift.transcriptValidation.agreedSegments}
                  helper="Cross-validated windows"
                />
                <ValidationMetric
                  label="Conflicts"
                  value={shift.transcriptValidation.conflictingSegments}
                  helper="Need technician review"
                />
                <ValidationMetric
                  label="Single Source"
                  value={shift.transcriptValidation.singleSourceSegments}
                  helper="Not yet corroborated"
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">{transcriptValidationSummary}</p>
            </div>

            {shift.transcriptSources.length > 0 && (
              <div className="grid gap-3 md:grid-cols-3">
                {shift.transcriptSources.map((source) => (
                  <div
                    key={source.source}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">{source.label}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
                        {source.chunkCount} chunk{source.chunkCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-4 text-sm text-slate-600">
                      {source.transcriptText || "Waiting for transcript from this source."}
                    </p>
                    {source.latestAt && (
                      <p className="mt-2 text-xs text-slate-500">
                        Updated {new Date(source.latestAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {transcriptConflictSegments.length > 0 && (
              <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                <div>
                  <p className="text-sm font-medium text-amber-900">Transcript windows needing review</p>
                  <p className="text-sm text-amber-800">
                    These note windows disagree across sources. Confirm the right wording before approval.
                  </p>
                </div>
                {transcriptConflictSegments.slice(0, 3).map((segment) => (
                  <div key={segment.id} className="rounded-lg bg-white/80 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                      {segment.startedAt
                        ? new Date(segment.startedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Unscheduled window"}
                    </p>
                    <div className="mt-2 space-y-2">
                      {segment.contributions.map((contribution) => (
                        <div key={`${segment.id}-${contribution.source}`}>
                          <p className="text-xs font-medium text-slate-500">{contribution.label}</p>
                          <p className="text-sm text-slate-700">{contribution.transcript}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 font-medium ${
                shift.transcriptReviewStatus === "approved"
                  ? "bg-green-100 text-green-700"
                  : shift.transcriptReviewStatus === "review_required"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {transcriptStatusLabel}
            </span>
            {shift.transcriptApprovedAt && shift.transcriptApprovedBy && (
              <span className="text-slate-500">
                Approved by #{shift.transcriptApprovedBy} on{" "}
                {new Date(shift.transcriptApprovedAt).toLocaleString()}
              </span>
            )}
            {shift.quantumExportedAt && (
              <span className="text-slate-500">
                Last Quantum export {new Date(shift.quantumExportedAt).toLocaleString()}
              </span>
            )}
          </div>

          <Textarea
            value={transcriptEditor}
            onChange={(event) => {
              setTranscriptEditor(event.target.value);
              if (!transcriptDirty) setTranscriptDirty(true);
            }}
            readOnly={!isCompleted}
            placeholder={
              isCompleted
                ? "Transcript will appear here after capture. Add or correct notes before approving."
                : "Transcript is streaming live and will appear here automatically."
            }
            className="min-h-64 bg-white"
          />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {isCompleted
                  ? transcriptEditorIsStale
                    ? "A new transcript chunk arrived while you were reviewing. AeroVision refreshed the review requirement so you can approve the latest notes."
                    : transcriptHasText
                    ? approvalBlockedByConflict
                      ? "Resolve the highlighted disagreements and replace the conflict placeholders before approving."
                      : transcriptConflictSegments.length > 0
                        ? "Conflicting source windows are still shown below for reference, but your transcript edits are ready for approval."
                      : "Save corrections if you need to come back, or approve to unlock Quantum."
                    : "No transcript is ready yet. Add the final notes here before approving."
                  : shift.transcriptUpdatedAt
                    ? `Last transcript update ${new Date(shift.transcriptUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : shift.transcriptValidation.distinctSources > 0
                      ? `${transcriptSingleSourceSegments.length} source-only note window${transcriptSingleSourceSegments.length === 1 ? "" : "s"} still waiting for corroboration.`
                      : "Waiting for the first live transcript chunk."}
              </div>
              {isCompleted && (
                <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleTranscriptAction("save")}
                  disabled={transcriptAction !== null || !transcriptDirty || transcriptEditorIsStale}
                >
                  {transcriptAction === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Draft
                </Button>
                <Button
                  onClick={() => handleTranscriptAction("approve")}
                  disabled={transcriptAction !== null || approvalBlocked}
                >
                  {transcriptAction === "approve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Approve Transcript
                </Button>
              </div>
            )}
          </div>

          {transcriptError && <p className="text-sm text-red-600">{transcriptError}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Measurement Feed
                {isActive && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-green-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    Live
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MeasurementFeed shiftId={id} isActive={isActive} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {!isCompleted && (
            <ShiftDeskMicRecorder
              ref={deskMicRecorderRef}
              shiftId={id}
              enabled={isActive || isPaused}
              onUnauthorized={handleExpiredDashboardSession}
              onStopComplete={async () => {
                await refreshShift();
              }}
            />
          )}

          {!isCompleted && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Add Measurement</CardTitle>
                <p className="text-sm text-slate-500">
                  Use this when the glasses or desk mic are offline. Enter one reading at a time.
                </p>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleManualMeasurementSubmit(event)}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Measurement type</label>
                    <Select
                      value={measurementForm.measurementType}
                      onValueChange={(value) => {
                        const selectedOption = MEASUREMENT_TYPE_OPTIONS.find(
                          (option) => option.value === value
                        );
                        if (!selectedOption) return;
                        setMeasurementForm((current) => ({
                          ...current,
                          measurementType: selectedOption.value,
                          unit: selectedOption.suggestedUnit,
                        }));
                        setMeasurementMessage(null);
                        setMeasurementError(null);
                      }}
                      disabled={!isActive || measurementSubmitting}
                    >
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEASUREMENT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      What was measured?
                    </label>
                    <Input
                      value={measurementForm.parameterName}
                      onChange={(event) => {
                        setMeasurementForm((current) => ({
                          ...current,
                          parameterName: event.target.value,
                        }));
                        setMeasurementMessage(null);
                        setMeasurementError(null);
                      }}
                      placeholder="Example: Engine mount bolt torque"
                      disabled={!isActive || measurementSubmitting}
                      className="bg-white"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Reading</label>
                      <Input
                        value={measurementForm.value}
                        onChange={(event) => {
                          setMeasurementForm((current) => ({
                            ...current,
                            value: event.target.value,
                          }));
                          setMeasurementMessage(null);
                          setMeasurementError(null);
                        }}
                        placeholder="45.0"
                        inputMode="decimal"
                        disabled={!isActive || measurementSubmitting}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Unit</label>
                      <Input
                        value={measurementForm.unit}
                        onChange={(event) => {
                          setMeasurementForm((current) => ({
                            ...current,
                            unit: event.target.value,
                          }));
                          setMeasurementMessage(null);
                          setMeasurementError(null);
                        }}
                        placeholder="ft-lbs"
                        disabled={!isActive || measurementSubmitting}
                        className="bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Procedure step
                        <span className="ml-1 text-slate-400">(optional)</span>
                      </label>
                      <Input
                        value={measurementForm.procedureStep}
                        onChange={(event) => {
                          setMeasurementForm((current) => ({
                            ...current,
                            procedureStep: event.target.value,
                          }));
                        }}
                        placeholder="5.2.3"
                        disabled={!isActive || measurementSubmitting}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Task card
                        <span className="ml-1 text-slate-400">(optional)</span>
                      </label>
                      <Input
                        value={measurementForm.taskCardRef}
                        onChange={(event) => {
                          setMeasurementForm((current) => ({
                            ...current,
                            taskCardRef: event.target.value,
                          }));
                        }}
                        placeholder="TC-2024-0847"
                        disabled={!isActive || measurementSubmitting}
                        className="bg-white"
                      />
                    </div>
                  </div>

                  {isPaused && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Resume the shift before adding more readings.
                    </div>
                  )}

                  {measurementError && (
                    <p className="text-sm text-red-600">{measurementError}</p>
                  )}
                  {measurementMessage && (
                    <p className="text-sm text-green-700">{measurementMessage}</p>
                  )}

                  <Button type="submit" disabled={!isActive || measurementSubmitting}>
                    {measurementSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save measurement
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {specProgress ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spec Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <SpecProgress {...specProgress} />
              </CardContent>
            </Card>
          ) : shift.measurementSpec ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spec: {shift.measurementSpec.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">Loading progress...</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-400">
                No measurement spec linked to this shift
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ValidationMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-lg bg-white/80 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}
