"use client";

// Session Detail Page — simplified view for technician review
// Shows: header, status banner, generated documents (primary), evidence (collapsed), transcript (collapsed)

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LiveCaptureView } from "@/components/live-capture-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { humanizeFieldLabel } from "@/lib/document-field-layout";
import {
  SESSION_STATUS_COLORS,
  SESSION_STATUS_LABELS,
} from "@/lib/session-status";
import { shouldPollSessionProgress } from "@/lib/session-progress";
import { apiUrl } from "@/lib/api-url";
import { useSmartPoll } from "@/lib/use-smart-poll";
import { PollStatusBadge } from "@/components/poll-status-badge";
import { LiveSessionPanel } from "@/components/live-session-panel";
import {
  ArrowLeft,
  Camera,
  Video,
  Mic,
  FileText,
  CheckCircle2,
  XCircle,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  Loader2,
  X,
  Image as ImageIcon,
  RefreshCw,
  Pencil,
  Save,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface VideoAnnotation {
  id: string;
  timestamp: number;
  tag: string;
  description: string;
  confidence: number;
}

interface Evidence {
  id: string;
  type: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  durationSeconds: number | null;
  transcription: string | null;
  aiExtraction: string | null;
  capturedAt: string;
  videoAnnotations: VideoAnnotation[];
}

interface DocumentData {
  id: string;
  documentType: string;
  contentJson: string;
  status: string;
  confidence: number;
  lowConfidenceFields: string;
  evidenceLineage: string | null;
  provenanceJson: string | null;
  generatedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  verificationJson: string | null;
  reviewedBy: { id: string; name: string | null } | null;
}

interface SessionDetail {
  id: string;
  status: string;
  description: string | null;
  shiftSessionId: string | null;
  componentId: string | null;
  expectedSteps: string | null;
  startedAt: string;
  completedAt: string | null;
  user: {
    name: string;
    badgeNumber: string;
    email: string | null;
    role: string;
  };
  organization: { name: string };
  evidence: Evidence[];
  documents: DocumentData[];
  analysis: {
    actionLog: string;
    partsIdentified: string;
    procedureSteps: string;
    anomalies: string;
    confidence: number;
    verificationSource: string | null;
    modelUsed: string;
    processingTime: number | null;
    costEstimate: number | null;
  } | null;
  processingProgress: {
    userFacingState: string | null;
    internalStage: string | null;
    running: boolean;
    terminal: boolean;
    failed: boolean;
    failedStage: string | null;
    lastError: string | null;
    packageArtifact: {
      id: string;
      packageType: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    } | null;
  } | null;
}

interface SessionDetailLoadError {
  title: string;
  error: string;
  nextStep: string;
  technicalDetails: string;
}

// ─── Status helpers ────────────────────────────────────────────────────

const DOCUMENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-purple-100 text-purple-700",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
};

const PROGRESS_STATE_COLORS: Record<string, string> = {
  Captured: "bg-cyan-100 text-cyan-700",
  Drafting: "bg-amber-100 text-amber-700",
  Verified: "bg-emerald-100 text-emerald-700",
  Packaged: "bg-sky-100 text-sky-700",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  "8130-3": "FAA 8130-3 — Airworthiness Approval Tag",
  "337": "FAA Form 337 — Major Repair and Alteration",
  "8010-4": "FAA 8010-4 — Federal Aviation Administration Complaint",
};

// ─── Helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeParseJson(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function buildSessionDetailLoadError(
  error: unknown,
  sessionId: string
): SessionDetailLoadError {
  if (error && typeof error === "object") {
    const candidate = error as Partial<SessionDetailLoadError>;
    if (
      typeof candidate.title === "string" &&
      typeof candidate.error === "string" &&
      typeof candidate.nextStep === "string"
    ) {
      return {
        title: candidate.title,
        error: candidate.error,
        nextStep: candidate.nextStep,
        technicalDetails:
          typeof candidate.technicalDetails === "string"
            ? candidate.technicalDetails
            : "Unknown error",
      };
    }
  }

  const detail =
    error instanceof Error ? error.message : "Failed to load session details.";

  if (detail.includes("404")) {
    return {
      title: "Session not found",
      error: `The session ${sessionId} could not be found.`,
      nextStep: "Return to sessions and try another one.",
      technicalDetails: detail,
    };
  }

  return {
    title: "Session details unavailable",
    error: "AeroVision could not load this session.",
    nextStep:
      "Retry this page or return to sessions. If the problem persists, check your connection and try again.",
    technicalDetails: detail,
  };
}

// ─── Main Component ────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SessionDetailLoadError | null>(null);
  const hasLoadedOnce = useRef(false);

  // UI state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const [reviewingDoc, setReviewingDoc] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Document field editing state
  const [editingField, setEditingField] = useState<{ docId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, Set<string>>>({});

  // ─── Data fetching ──────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnce.current;
    if (isFirstLoad) setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}`));
      const payload = await res.json().catch(() => null);

      if (res.status === 401) {
        window.location.reload();
        return;
      }

      if (!res.ok) {
        throw payload ?? new Error(`API error: ${res.status}`);
      }
      setSession(payload);
      hasLoadedOnce.current = true;
    } catch (err) {
      if (isFirstLoad) setSession(null);
      setError(buildSessionDetailLoadError(err, sessionId));
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Smart polling for processing sessions
  const isInTransitionalState = !!session && (
    session.status === "capturing" ||
    session.status === "capture_complete" ||
    session.status === "processing"
  );
  const isPollingEnabled = !!session && (
    shouldPollSessionProgress(session.processingProgress) || isInTransitionalState
  );
  const sessionPoll = useSmartPoll({
    pollFn: fetchSession,
    enabled: isPollingEnabled,
    initialIntervalMs: 2000,
    maxIntervalMs: 30000,
    backoffFactor: 1.5,
    resetKey: session?.processingProgress?.internalStage ?? session?.status ?? null,
  });

  // Auto-expand the first document that needs review
  useEffect(() => {
    if (!session || hasAutoExpanded || expandedDoc) return;
    const firstReviewTarget =
      session.documents.find((doc) => doc.status !== "approved" && doc.status !== "rejected")
      || session.documents[0];
    if (firstReviewTarget) {
      setExpandedDoc(firstReviewTarget.id);
    }
    setHasAutoExpanded(true);
  }, [expandedDoc, hasAutoExpanded, session]);

  // ─── Actions ──────────────────────────────────────────────────────

  // Approve or flag a document
  async function handleReview(documentId: string, action: "approve" | "reject", notes?: string) {
    setReviewingDoc(documentId);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action, notes }),
      });
      if (!res.ok) throw new Error("Review failed");
      await fetchSession();
      setShowRejectDialog(null);
      setRejectNotes("");
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setReviewingDoc(null);
    }
  }

  // Approve all pending documents at once
  async function handleApproveAll() {
    if (!session) return;
    const pendingDocs = session.documents.filter(
      (doc) => doc.status !== "approved" && doc.status !== "rejected"
    );
    if (pendingDocs.length === 0) return;

    setBulkApproving(true);
    try {
      for (const doc of pendingDocs) {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/review`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id, action: "approve" }),
        });
        if (!res.ok) throw new Error(`Failed to approve ${doc.id}`);
      }
      await fetchSession();
    } catch (err) {
      console.error("Bulk approve failed:", err);
    } finally {
      setBulkApproving(false);
    }
  }

  // Save an edited document field
  async function handleSaveField(docId: string, fieldName: string, newValue: string) {
    setSavingField(true);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/documents/${docId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [fieldName]: newValue } }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditedFields((prev) => {
        const copy = { ...prev };
        if (!copy[docId]) copy[docId] = new Set();
        copy[docId] = new Set(copy[docId]).add(fieldName);
        return copy;
      });
      setEditingField(null);
      setEditingValue("");
      await fetchSession();
    } catch (err) {
      console.error("Failed to save field:", err);
    } finally {
      setSavingField(false);
    }
  }

  // ─── Loading / error states ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "rgb(140, 140, 140)" }} />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="py-12">
        <Link href="/sessions" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "rgb(100, 100, 100)" }}>
          <ArrowLeft className="h-4 w-4" /> Back to Sessions
        </Link>
        <Card className="border shadow-sm" style={{ borderColor: "rgb(253, 230, 138)", backgroundColor: "rgba(255, 251, 235, 0.92)" }}>
          <CardContent className="px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(245, 158, 11, 0.12)" }}>
              <AlertTriangle className="h-6 w-6" style={{ color: "rgb(217, 119, 6)" }} />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: "rgb(120, 53, 15)" }}>
              {error?.title || "Session not found"}
            </h1>
            <p className="mt-3 text-sm leading-6" style={{ color: "rgb(146, 64, 14)" }}>
              {error?.error || "The selected session could not be loaded."}
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "rgb(146, 64, 14)" }}>
              Next step: {error?.nextStep || "Return to sessions and try another one."}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={() => void fetchSession()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button asChild variant="outline">
                <Link href="/sessions">Back to Sessions</Link>
              </Button>
            </div>
            <p className="mt-5 text-xs font-mono" style={{ color: "rgb(180, 83, 9)" }}>
              Session: {sessionId}
              {error?.technicalDetails ? ` · ${error.technicalDetails}` : ""}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Live capture view ──────────────────────────────────────────────

  if (session.status === "capturing" && session.shiftSessionId) {
    return (
      <LiveCaptureView
        sessionId={session.id}
        shiftSessionId={session.shiftSessionId}
        description={session.description}
        startedAt={session.startedAt}
        onSessionEnded={() => void fetchSession()}
      />
    );
  }

  // ─── Processing view ──────────────────────────────────────────────

  const isProcessing =
    session.status === "capture_complete" ||
    session.status === "processing" ||
    (session.processingProgress?.running && session.documents.length === 0);

  if (isProcessing) {
    const progressState = session.processingProgress?.userFacingState;
    const progressBadgeClass =
      (progressState && PROGRESS_STATE_COLORS[progressState]) ||
      "bg-slate-100 text-slate-700";

    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <Link href="/sessions" className="inline-flex items-center gap-1 text-sm mb-8 hover:underline" style={{ color: "rgb(100, 100, 100)" }}>
          <ArrowLeft className="h-4 w-4" /> Back to Sessions
        </Link>
        <div className="mb-6">
          <Loader2 className="h-10 w-10 animate-spin mx-auto" style={{ color: "rgb(147, 51, 234)" }} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-3" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
          Processing your capture
        </h1>
        <p className="text-sm leading-relaxed mb-2" style={{ color: "rgb(100, 100, 100)" }}>
          AeroVision is analyzing the transcript and measurements, drafting documents, and verifying evidence.
        </p>
        {progressState && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mt-4 ${progressBadgeClass}`}>
            <Clock className="h-3 w-3" />
            {progressState}
          </span>
        )}
        {session.processingProgress?.failed && (
          <div className="mt-6 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "rgb(254, 202, 202)", backgroundColor: "rgb(254, 242, 242)", color: "rgb(153, 27, 27)" }}>
            Processing failed{session.processingProgress.lastError ? `: ${session.processingProgress.lastError}` : ""}
          </div>
        )}
        <div className="mt-4">
          <PollStatusBadge poll={sessionPoll} isPolling={isPollingEnabled} />
        </div>
        <p className="text-xs mt-6" style={{ color: "rgb(156, 163, 175)" }}>
          This page will update automatically when documents are ready.
        </p>
      </div>
    );
  }

  // ─── Computed values for main view ──────────────────────────────────

  const photos = session.evidence.filter((e) => e.type === "PHOTO");
  const videos = session.evidence.filter((e) => e.type === "VIDEO");
  const audioChunks = session.evidence.filter((e) => e.type === "AUDIO_CHUNK");
  const fullTranscript = audioChunks
    .filter((a) => a.transcription)
    .map((a) => a.transcription)
    .join("\n\n");

  // Status banner counts
  const pendingDocs = session.documents.filter(
    (doc) => doc.status !== "approved" && doc.status !== "rejected"
  );
  const approvedDocs = session.documents.filter((doc) => doc.status === "approved");
  const allApproved = session.documents.length > 0 && pendingDocs.length === 0;

  // Progress state for header badge
  const progressState = session.processingProgress?.userFacingState;
  const progressBadgeClass =
    (progressState && PROGRESS_STATE_COLORS[progressState]) ||
    "bg-slate-100 text-slate-700";

  // Evidence summary for collapsed section
  const evidenceParts: string[] = [];
  if (photos.length > 0) evidenceParts.push(`${photos.length} photo${photos.length !== 1 ? "s" : ""}`);
  if (videos.length > 0) evidenceParts.push(`${videos.length} video${videos.length !== 1 ? "s" : ""}`);
  if (audioChunks.length > 0) evidenceParts.push(`${audioChunks.length} audio`);
  const evidenceSummary = evidenceParts.length > 0 ? evidenceParts.join(", ") : "none";

  return (
    <div>
      {/* Photo lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white" }}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Evidence photo"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Reject notes dialog */}
      {showRejectDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => setShowRejectDialog(null)}
        >
          <div
            className="bg-white rounded-xl p-6 shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-3" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              Flag for Correction
            </h3>
            <p className="text-sm mb-4" style={{ color: "rgb(100, 100, 100)" }}>
              Add optional notes explaining what needs correction.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Correction notes (optional)..."
              className="w-full border rounded-lg p-3 text-sm mb-4 resize-none"
              style={{ borderColor: "rgb(220, 220, 220)", minHeight: "100px" }}
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowRejectDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={reviewingDoc === showRejectDialog}
                onClick={() => handleReview(showRejectDialog, "reject", rejectNotes)}
              >
                {reviewingDoc === showRejectDialog ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Flag for Correction"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <Link href="/sessions" className="inline-flex items-center gap-1 text-sm mb-6 hover:underline" style={{ color: "rgb(100, 100, 100)" }}>
        <ArrowLeft className="h-4 w-4" /> Back to Sessions
      </Link>

      {/* ═══ HEADER ═══ */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              {session.user.name}
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgb(100, 100, 100)" }}>
              Badge: {session.user.badgeNumber} &middot; {session.organization.name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                session.status === "approved" || session.status === "rejected"
                  ? SESSION_STATUS_COLORS[session.status as keyof typeof SESSION_STATUS_COLORS] || "bg-slate-100 text-slate-700"
                  : progressBadgeClass
              }`}
            >
              {session.status === "approved" && <CheckCircle2 className="h-4 w-4" />}
              {session.status === "rejected" && <XCircle className="h-4 w-4" />}
              {session.status === "approved" || session.status === "rejected"
                ? SESSION_STATUS_LABELS[session.status as keyof typeof SESSION_STATUS_LABELS] || session.status
                : progressState || (SESSION_STATUS_LABELS[session.status as keyof typeof SESSION_STATUS_LABELS] || session.status)}
            </span>
            <PollStatusBadge poll={sessionPoll} isPolling={isPollingEnabled} />
          </div>
        </div>
        <div className="flex gap-6 mt-3 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatDate(session.startedAt)}
          </span>
          <span>Duration: {formatDuration(session.startedAt, session.completedAt)}</span>
        </div>
        {session.description && (
          <p className="mt-3 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
            {session.description}
          </p>
        )}

        {/* Processing progress banner */}
        {session.processingProgress && (
          <div
            className="mt-4 rounded-2xl border px-4 py-3"
            style={{
              borderColor: session.processingProgress.failed
                ? "rgba(244, 63, 94, 0.25)"
                : "rgba(148, 163, 184, 0.2)",
              backgroundColor: session.processingProgress.failed
                ? "rgba(255, 241, 242, 0.95)"
                : "rgba(248, 250, 252, 0.95)",
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${progressBadgeClass}`}>
                {progressState || "In Progress"}
              </span>
              {session.processingProgress.packageArtifact && (
                <span className="text-xs font-medium" style={{ color: "rgb(80, 80, 80)" }}>
                  Package ready: {session.processingProgress.packageArtifact.packageType}
                </span>
              )}
            </div>
            {session.processingProgress.failed && (
              <div className="mt-2 flex items-start gap-3">
                <p className="text-sm flex-1" style={{ color: "rgb(190, 24, 93)" }}>
                  Failed during {session.processingProgress.failedStage || "processing"}:{" "}
                  {session.processingProgress.lastError || "Unknown error"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await fetch(apiUrl(`/api/sessions/${sessionId}`), {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "retry_processing" }),
                    });
                    await fetchSession();
                  }}
                  className="shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ LIVE CAPTURE PANEL ═══ */}
      {session.status === "capturing" && (
        <LiveSessionPanel
          sessionId={sessionId}
          evidenceCount={session.evidence.length}
          startedAt={session.startedAt}
          hasGlassesStream={session.evidence.some(
            (e) => e.type === "PHOTO" || e.type === "VIDEO"
          )}
          onSessionEnded={() => void fetchSession()}
        />
      )}

      {/* ═══ STATUS BANNER ═══ */}
      {session.documents.length > 0 && (
        <div
          className="mb-6 rounded-xl border px-5 py-4 flex items-center justify-between"
          style={{
            borderColor: allApproved ? "rgb(187, 247, 208)" : "rgb(191, 219, 254)",
            backgroundColor: allApproved ? "rgb(240, 253, 244)" : "rgb(239, 246, 255)",
          }}
        >
          <div className="flex items-center gap-3">
            {allApproved ? (
              <CheckCircle2 className="h-5 w-5" style={{ color: "rgb(34, 197, 94)" }} />
            ) : (
              <FileText className="h-5 w-5" style={{ color: "rgb(59, 130, 246)" }} />
            )}
            <p className="text-sm font-medium" style={{ color: allApproved ? "rgb(21, 128, 61)" : "rgb(29, 78, 216)" }}>
              {allApproved
                ? "All documents approved"
                : `${pendingDocs.length} document${pendingDocs.length !== 1 ? "s" : ""} ready for your review`}
            </p>
          </div>
          {pendingDocs.length > 0 && (
            <Button
              size="sm"
              disabled={bulkApproving}
              onClick={handleApproveAll}
              className="gap-1.5"
              style={{ backgroundColor: "rgb(34, 197, 94)", color: "white" }}
            >
              {bulkApproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve All
            </Button>
          )}
        </div>
      )}

      {/* ═══ GENERATED DOCUMENTS (primary content) ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <FileText className="h-5 w-5" /> Generated Documents ({session.documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: "rgb(200, 200, 200)" }} />
              <p className="text-sm font-medium mb-1" style={{ color: "rgb(100, 100, 100)" }}>
                No documents generated yet
              </p>
              <p className="text-xs" style={{ color: "rgb(160, 160, 160)" }}>
                Documents will appear here once AI processing is complete.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {session.documents.map((doc) => {
                const isExpanded = expandedDoc === doc.id;
                const contentFields = safeParseJson(doc.contentJson) as Record<string, string> | null;
                const isEditable = doc.status === "draft" || doc.status === "pending_review";
                const docEditedFields = editedFields[doc.id];

                // Parse rejection notes from reviewNotes if present
                let rejectionNote: string | null = null;
                if (doc.reviewNotes) {
                  try {
                    const parsed = JSON.parse(doc.reviewNotes);
                    rejectionNote = parsed?.rejectionNote || doc.reviewNotes;
                  } catch {
                    rejectionNote = doc.reviewNotes;
                  }
                }

                return (
                  <div
                    key={doc.id}
                    id={`document-${doc.id}`}
                    className="border rounded-lg overflow-hidden"
                    style={{ borderColor: "rgb(230, 230, 230)" }}
                  >
                    {/* Document header — click to expand/collapse */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-slate-400">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "rgb(20, 20, 20)" }}>
                            {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "rgb(120, 120, 120)" }}>
                            {formatDate(doc.generatedAt)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          DOCUMENT_STATUS_COLORS[doc.status] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {DOCUMENT_STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </div>

                    {/* Expanded document content */}
                    {isExpanded && (
                      <div className="border-t px-4 py-4" style={{ borderColor: "rgb(240, 240, 240)" }}>
                        {/* Document fields */}
                        {contentFields && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold mb-3" style={{ color: "rgb(80, 80, 80)" }}>Form Fields</h4>
                            <div className="grid md:grid-cols-2 gap-2">
                              {Object.entries(contentFields).map(([key, val]) => {
                                const isCurrentlyEditing = editingField?.docId === doc.id && editingField?.field === key;
                                const wasEdited = docEditedFields?.has(key);

                                return (
                                  <div
                                    key={key}
                                    className="group text-xs p-2 rounded"
                                    style={{ backgroundColor: "rgb(248, 248, 248)" }}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="font-medium shrink-0 min-w-24" style={{ color: "rgb(80, 80, 80)" }}>
                                        {humanizeFieldLabel(key)}:
                                      </span>

                                      {isCurrentlyEditing ? (
                                        <div className="flex-1 flex items-center gap-1.5">
                                          <input
                                            type="text"
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            className="flex-1 text-xs border rounded px-2 py-1"
                                            style={{ borderColor: "rgb(180, 180, 180)" }}
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") handleSaveField(doc.id, key, editingValue);
                                              if (e.key === "Escape") { setEditingField(null); setEditingValue(""); }
                                            }}
                                          />
                                          <button
                                            onClick={() => handleSaveField(doc.id, key, editingValue)}
                                            disabled={savingField}
                                            className="p-1 rounded hover:bg-green-100"
                                            title="Save"
                                          >
                                            {savingField ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" style={{ color: "rgb(34, 197, 94)" }} />}
                                          </button>
                                          <button
                                            onClick={() => { setEditingField(null); setEditingValue(""); }}
                                            className="p-1 rounded hover:bg-red-100"
                                            title="Cancel"
                                          >
                                            <X className="h-3 w-3" style={{ color: "rgb(220, 50, 50)" }} />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="flex-1" style={{ color: "rgb(40, 40, 40)" }}>{val || "—"}</span>
                                          <div className="flex items-center gap-1 shrink-0">
                                            {wasEdited && (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: "rgb(219, 234, 254)", color: "rgb(37, 99, 235)" }}>
                                                edited
                                              </span>
                                            )}
                                            {isEditable && (
                                              <button
                                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200"
                                                title="Edit field"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingField({ docId: doc.id, field: key });
                                                  setEditingValue(val);
                                                }}
                                              >
                                                <Pencil className="h-3 w-3" style={{ color: "rgb(100, 100, 100)" }} />
                                              </button>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Review info */}
                        {doc.reviewedAt && (
                          <div className="mb-4 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                            Reviewed {formatDate(doc.reviewedAt)}
                            {doc.reviewedBy ? ` by ${doc.reviewedBy.name}` : ""}
                            {rejectionNote && (
                              <p className="mt-1 p-2 rounded" style={{ backgroundColor: "rgb(255, 245, 245)", color: "rgb(180, 50, 50)" }}>
                                Notes: {rejectionNote}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "rgb(240, 240, 240)" }}>
                          {doc.status !== "approved" && doc.status !== "rejected" && (
                            <>
                              <Button
                                size="sm"
                                disabled={reviewingDoc === doc.id}
                                onClick={() => handleReview(doc.id, "approve")}
                                className="gap-1.5"
                                style={{ backgroundColor: "rgb(34, 197, 94)", color: "white" }}
                              >
                                {reviewingDoc === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowRejectDialog(doc.id)}
                                className="gap-1.5"
                                style={{ color: "rgb(220, 50, 50)", borderColor: "rgb(220, 50, 50)" }}
                              >
                                <XCircle className="h-4 w-4" />
                                Flag for Correction
                              </Button>
                            </>
                          )}
                          {doc.status === "approved" && (
                            <>
                              <a
                                href={apiUrl(`/api/capture-documents/download/${doc.id}`)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button size="sm" variant="outline" className="gap-1.5">
                                  <Download className="h-4 w-4" />
                                  Download PDF
                                </Button>
                              </a>
                              <span className="text-xs font-medium" style={{ color: "rgb(21, 128, 61)" }}>
                                Document approved.
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ EVIDENCE (collapsed by default) ═══ */}
      {session.evidence.length > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader
            className="cursor-pointer"
            onClick={() => setEvidenceOpen(!evidenceOpen)}
          >
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Camera className="h-5 w-5" /> Evidence ({evidenceSummary})
              {evidenceOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
            </CardTitle>
          </CardHeader>
          {evidenceOpen && (
            <CardContent>
              <div className="space-y-6">
                {/* Photos */}
                {photos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "rgb(60, 60, 60)" }}>
                      <ImageIcon className="h-4 w-4" /> Photos ({photos.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {photos.map((photo) => {
                        const extraction = safeParseJson(photo.aiExtraction) as Record<string, unknown> | null;
                        return (
                          <div key={photo.id} className="space-y-2">
                            <div
                              className="aspect-square rounded-lg overflow-hidden cursor-pointer border hover:opacity-90 transition-opacity"
                              style={{ borderColor: "rgb(230, 230, 230)" }}
                              onClick={() => setLightboxUrl(photo.fileUrl)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.fileUrl}
                                alt="Captured photo"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  e.currentTarget.parentElement!.innerHTML =
                                    '<div class="flex items-center justify-center h-full" style="background:rgb(245,245,245);color:rgb(160,160,160)"><span class="text-xs">Image unavailable</span></div>';
                                }}
                              />
                            </div>
                            <p className="text-xs" style={{ color: "rgb(140, 140, 140)" }}>
                              {formatDate(photo.capturedAt)} &middot; {formatFileSize(photo.fileSize)}
                            </p>
                            {extraction && (
                              <div className="text-xs p-2 rounded" style={{ backgroundColor: "rgb(248, 248, 248)", color: "rgb(80, 80, 80)" }}>
                                {Object.entries(extraction).slice(0, 5).map(([key, val]) => (
                                  <p key={key}>
                                    <span className="font-medium">{key}:</span> {String(val)}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Videos */}
                {videos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "rgb(60, 60, 60)" }}>
                      <Video className="h-4 w-4" /> Videos ({videos.length})
                    </h3>
                    <div className="space-y-4">
                      {videos.map((vid) => (
                        <div key={vid.id} className="border rounded-lg p-4" style={{ borderColor: "rgb(230, 230, 230)" }}>
                          <video
                            controls
                            className="w-full max-h-96 rounded-lg mb-3"
                            style={{ backgroundColor: "rgb(10, 10, 10)" }}
                          >
                            <source src={vid.fileUrl} type={vid.mimeType} />
                            Your browser does not support video playback.
                          </video>
                          <div className="flex gap-4 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                            {vid.durationSeconds && <span>{formatDuration("2000-01-01T00:00:00Z", new Date(Date.parse("2000-01-01T00:00:00Z") + vid.durationSeconds * 1000).toISOString())}</span>}
                            <span>{formatFileSize(vid.fileSize)}</span>
                            <span>{formatDate(vid.capturedAt)}</span>
                          </div>
                          {vid.videoAnnotations.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold mb-2" style={{ color: "rgb(80, 80, 80)" }}>
                                AI Annotations ({vid.videoAnnotations.length})
                              </p>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {vid.videoAnnotations.map((ann) => (
                                  <div
                                    key={ann.id}
                                    className="flex items-start gap-2 text-xs p-2 rounded cursor-pointer hover:bg-slate-50"
                                    onClick={() => {
                                      const videoEl = document.querySelector(`video`) as HTMLVideoElement | null;
                                      if (videoEl) {
                                        videoEl.currentTime = ann.timestamp;
                                        videoEl.play();
                                      }
                                    }}
                                  >
                                    <span className="font-mono shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgb(240, 240, 240)", color: "rgb(80, 80, 80)" }}>
                                      {formatTimestamp(ann.timestamp)}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "rgb(230, 240, 255)", color: "rgb(50, 100, 180)" }}>
                                      {ann.tag}
                                    </span>
                                    <span style={{ color: "rgb(80, 80, 80)" }}>{ann.description}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audio */}
                {audioChunks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "rgb(60, 60, 60)" }}>
                      <Mic className="h-4 w-4" /> Audio Chunks ({audioChunks.length})
                    </h3>
                    <div className="space-y-3">
                      {audioChunks.map((audio) => (
                        <div key={audio.id} className="border rounded-lg p-4" style={{ borderColor: "rgb(230, 230, 230)" }}>
                          <audio controls className="w-full mb-2">
                            <source src={audio.fileUrl} type={audio.mimeType} />
                            Your browser does not support audio playback.
                          </audio>
                          <div className="flex gap-4 text-xs mb-2" style={{ color: "rgb(120, 120, 120)" }}>
                            {audio.durationSeconds && <span>{Math.round(audio.durationSeconds)}s</span>}
                            <span>{formatFileSize(audio.fileSize)}</span>
                            <span>{formatDate(audio.capturedAt)}</span>
                          </div>
                          {audio.transcription && (
                            <div className="text-xs p-3 rounded" style={{ backgroundColor: "rgb(248, 248, 248)", color: "rgb(60, 60, 60)" }}>
                              <p className="font-semibold mb-1" style={{ color: "rgb(80, 80, 80)" }}>Transcription:</p>
                              <p className="whitespace-pre-wrap">{audio.transcription}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ═══ FULL TRANSCRIPT (collapsed by default) ═══ */}
      {fullTranscript && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader
            className="cursor-pointer"
            onClick={() => setTranscriptOpen(!transcriptOpen)}
          >
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Mic className="h-5 w-5" /> Full Transcript
              {transcriptOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
            </CardTitle>
          </CardHeader>
          {transcriptOpen && (
            <CardContent>
              <div className="text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" style={{ color: "rgb(60, 60, 60)" }}>
                {fullTranscript}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
