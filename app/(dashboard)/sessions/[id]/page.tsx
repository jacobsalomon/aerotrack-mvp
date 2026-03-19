"use client";

// Session Detail Page — full view of a capture session
// Shows: header, evidence gallery (photos/video/audio with playback),
// AI analysis + transcript, generated documents with approve/reject, audit trail

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LiveCaptureView } from "@/components/live-capture-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EvidenceChainDrawer,
  type DocumentProvenancePayload,
} from "@/components/evidence-chain-drawer";
import {
  getDocumentFieldSections,
  humanizeFieldLabel,
} from "@/lib/document-field-layout";
import {
  type FieldDispositionStatus,
  getDispositionLabel,
  parseDocumentReviewState,
} from "@/lib/document-review-state";
import {
  normalizeProcedureSteps,
  type ProcedureStepInput,
} from "@/lib/session-analysis";
import { deriveReviewerCockpitSummary } from "@/lib/reviewer-cockpit";
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
  Brain,
  Shield,
  Loader2,
  X,
  Image as ImageIcon,
  Plus,
  FileCheck,
  FilePlus2,
  Sparkles,
  Wrench,
  Search,
  CirclePlus,
  CircleMinus,
  CirclePlay,
  Droplet,
  Hammer,
  BookOpen,
  ExternalLink,
  ArrowRightLeft,
  ArrowRight,
  Info,
  AlertCircle,
  RefreshCw,
  Pencil,
  Save,
  Eye,
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

interface EvidenceLineageEntry {
  source: "photo_extraction" | "video_analysis" | "video_annotation" | "audio_transcript" | "cmm_reference" | "ai_inferred";
  detail: string;
  confidence: number;
}

interface VerificationIssue {
  field: string;
  issue: string;
  severity: "info" | "warning" | "critical";
}

interface VerificationData {
  verified?: boolean;
  overallConfidence?: number;
  confidence?: number;
  issues?: VerificationIssue[];
  documentReviews?: Array<{
    documentType: string;
    issues: VerificationIssue[];
    confidence: number;
  }>;
}

interface FieldDispositionComposer {
  docId: string;
  fieldKey: string;
  status: Exclude<FieldDispositionStatus, "manually_verified">;
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
  reviewedBy: { id: string; firstName: string; lastName: string } | null;
}

interface SessionAnalysis {
  actionLog: string;
  partsIdentified: string;
  procedureSteps: string;
  anomalies: string;
  confidence: number;
  verificationSource: string | null;
  modelUsed: string;
  processingTime: number | null;
  costEstimate: number | null;
}

// Parsed types for structured AI analysis data
interface ParsedActionLogEntry {
  timestamp: number;
  action: string;
  details?: string;
}

interface ParsedPart {
  partNumber: string;
  serialNumber?: string;
  description?: string;
  type?: string;
  confidence?: number;
}

interface ParsedAnomaly {
  description: string;
  severity: "info" | "warning" | "critical";
  timestamp?: number;
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
  analysis: SessionAnalysis | null;
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

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  timestamp: string;
  user: { name: string } | null;
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

function fieldAnchorId(docId: string, fieldKey: string): string {
  return `field-${docId}-${fieldKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function fieldSaveKey(docId: string, fieldKey: string): string {
  return `${docId}:${fieldKey}`;
}

function safeParseJson(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return "rgb(34, 197, 94)";
  if (score >= 0.5) return "rgb(202, 138, 4)";
  return "rgb(239, 68, 68)";
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
    error instanceof Error ? error.message : "Failed to load the reviewer cockpit.";

  if (detail.includes("404")) {
    return {
      title: "Session not found",
      error: `The session ${sessionId} could not be found.`,
      nextStep:
        "Return to the review queue and try another session.",
      technicalDetails: detail,
    };
  }

  return {
    title: "Reviewer cockpit unavailable",
    error: "AeroVision could not load this session.",
    nextStep:
      "Retry this page or return to the review queue. If the problem persists, check your connection and try again.",
    technicalDetails: detail,
  };
}

// ─── Main Component ────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SessionDetailLoadError | null>(null);
  // Track whether initial data has loaded so background polls don't flash a spinner
  const hasLoadedOnce = useRef(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [reviewingDoc, setReviewingDoc] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);

  // Create document state
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [docDescription, setDocDescription] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Document field editing state
  const [editingField, setEditingField] = useState<{ docId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, Set<string>>>({});
  const [documentProvenance, setDocumentProvenance] = useState<Record<string, DocumentProvenancePayload | null>>({});
  const [loadingProvenance, setLoadingProvenance] = useState<Record<string, boolean>>({});
  const [activeEvidenceField, setActiveEvidenceField] = useState<{ docId: string; fieldKey: string } | null>(null);
  const [fieldDispositionComposer, setFieldDispositionComposer] = useState<FieldDispositionComposer | null>(null);
  const [fieldDispositionRationale, setFieldDispositionRationale] = useState("");
  const [savingDispositionKey, setSavingDispositionKey] = useState<string | null>(null);
  const [showAllBlockers, setShowAllBlockers] = useState(false);

  // Expected Steps (SOP) editing state
  const [expectedStepsText, setExpectedStepsText] = useState("");
  const [expectedStepsEditing, setExpectedStepsEditing] = useState(false);
  const [expectedStepsSaving, setExpectedStepsSaving] = useState(false);
  const [expectedStepsSaved, setExpectedStepsSaved] = useState(false);

  const fetchSession = useCallback(async () => {
    // Only show the full-page loading spinner on the very first load.
    // Background polls silently update data so the live capture view doesn't blink.
    const isFirstLoad = !hasLoadedOnce.current;
    if (isFirstLoad) setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}`));
      const payload = await res.json().catch(() => null);

      // Session expired — reload to trigger login redirect
      if (res.status === 401) {
        window.location.reload();
        return;
      }

      if (!res.ok) {
        throw payload ?? new Error(`API error: ${res.status}`);
      }
      const data = payload;
      setSession(data);
      hasLoadedOnce.current = true;
    } catch (err) {
      // Only blank the session on initial load failures, not background poll hiccups
      if (isFirstLoad) setSession(null);
      setError(buildSessionDetailLoadError(err, sessionId));
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }, [sessionId]);

  const fetchDocumentProvenance = useCallback(async (documentId: string) => {
    if (documentProvenance[documentId] !== undefined || loadingProvenance[documentId]) {
      return;
    }

    setLoadingProvenance((prev) => ({ ...prev, [documentId]: true }));
    try {
      const res = await fetch(apiUrl(`/api/documents/${documentId}/provenance`));
      if (!res.ok) {
        setDocumentProvenance((prev) => ({ ...prev, [documentId]: null }));
        return;
      }

      const data = (await res.json()) as DocumentProvenancePayload;
      setDocumentProvenance((prev) => ({ ...prev, [documentId]: data }));
    } catch (err) {
      console.warn("Failed to load provenance:", err);
      setDocumentProvenance((prev) => ({ ...prev, [documentId]: null }));
    } finally {
      setLoadingProvenance((prev) => ({ ...prev, [documentId]: false }));
    }
  }, [documentProvenance, loadingProvenance]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Smart polling: starts fast (2s), backs off to 30s, resets on status change or user interaction
  // Also poll when session is in a transitional state (capture_complete / processing) even if no job yet
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
    // When the processing stage changes, reset to fast polling
    resetKey: session?.processingProgress?.internalStage ?? session?.status ?? null,
  });

  useEffect(() => {
    if (!session || hasAutoExpanded || expandedDoc) return;

    const firstReviewTarget =
      session.documents.find((doc) => doc.status !== "approved" && doc.status !== "rejected")
      || session.documents[0];

    if (firstReviewTarget) {
      setExpandedDoc(firstReviewTarget.id);
      void fetchDocumentProvenance(firstReviewTarget.id);
    }

    setHasAutoExpanded(true);
  }, [expandedDoc, fetchDocumentProvenance, hasAutoExpanded, session]);

  // Sync expected steps text when session loads
  useEffect(() => {
    if (session?.expectedSteps !== undefined) {
      setExpectedStepsText(session.expectedSteps || "");
    }
  }, [session?.expectedSteps]);

  // Save expected steps to the backend
  async function handleSaveExpectedSteps() {
    setExpectedStepsSaving(true);
    setExpectedStepsSaved(false);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSteps: expectedStepsText || null }),
      });
      if (!res.ok) throw new Error("Save failed");
      await fetchSession();
      setExpectedStepsEditing(false);
      setExpectedStepsSaved(true);
      setTimeout(() => setExpectedStepsSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save expected steps:", err);
    } finally {
      setExpectedStepsSaving(false);
    }
  }

  // Fetch audit trail when expanded
  useEffect(() => {
    if (!auditOpen) return;
    async function fetchAudit() {
      try {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/audit`));
        if (res.ok) {
          const data = await res.json();
          setAuditEntries(data);
        }
      } catch {
        // Audit trail is optional — don't block the page
      }
    }
    fetchAudit();
  }, [auditOpen, sessionId]);

  // Approve or reject a document
  async function handleReview(documentId: string, action: "approve" | "reject", notes?: string, refreshSession = true) {
    setReviewingDoc(documentId);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action, notes }),
      });
      if (!res.ok) throw new Error("Review failed");
      // Refresh session data to reflect the update
      if (refreshSession) {
        await fetchSession();
      }
      setShowRejectDialog(null);
      setRejectNotes("");
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setReviewingDoc(null);
    }
  }

  // Create a document manually by type + optional description
  async function handleCreateDocument() {
    if (!selectedDocType) return;
    setCreatingDoc(true);
    setCreateError(null);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/create-document`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: selectedDocType,
          description: docDescription || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      // Refresh session to show the new document
      await fetchSession();
      setShowCreateDoc(false);
      setSelectedDocType(null);
      setDocDescription("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setCreatingDoc(false);
    }
  }

  // Save an edited document field via PATCH
  async function handleSaveField(docId: string, fieldName: string, newValue: string) {
    setSavingField(true);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/documents/${docId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [fieldName]: newValue } }),
      });
      if (!res.ok) throw new Error("Save failed");
      // Track edited fields for visual indicator
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

  async function handleSetFieldDisposition(
    docId: string,
    fieldKey: string,
    status: FieldDispositionStatus | null,
    rationale?: string
  ) {
    const saveKey = fieldSaveKey(docId, fieldKey);
    setSavingDispositionKey(saveKey);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/documents/${docId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldDisposition: {
            fieldKey,
            status,
            rationale: rationale?.trim() || null,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save certifier disposition");
      setFieldDispositionComposer(null);
      setFieldDispositionRationale("");
      await fetchSession();
    } catch (err) {
      console.error("Failed to save field disposition:", err);
    } finally {
      setSavingDispositionKey(null);
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
              Next step: {error?.nextStep || "Return to the review queue and try another session."}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={() => void fetchSession()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry Reviewer Cockpit
              </Button>
              <Button asChild variant="outline">
                <Link href="/sessions">Back to Review Queue</Link>
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

  // If the session is actively capturing and has a linked shift, show the live capture view
  // instead of the full reviewer cockpit
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

  // For freshly ended sessions that are still processing, show a simpler view
  // instead of the full reviewer cockpit (which is overwhelming with no documents yet)
  const isProcessing =
    session.status === "capture_complete" ||
    session.status === "processing" ||
    (session.processingProgress?.running && session.documents.length === 0);

  if (isProcessing) {
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
        {session.processingProgress?.userFacingState && (
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mt-4 ${
              (session.processingProgress.userFacingState && PROGRESS_STATE_COLORS[session.processingProgress.userFacingState]) || "bg-slate-100 text-slate-700"
            }`}
          >
            <Clock className="h-3 w-3" />
            {session.processingProgress.userFacingState}
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

  // Categorize evidence
  const photos = session.evidence.filter((e) => e.type === "PHOTO");
  const videos = session.evidence.filter((e) => e.type === "VIDEO");
  const audioChunks = session.evidence.filter((e) => e.type === "AUDIO_CHUNK");

  // Build full transcript from all audio chunks
  const fullTranscript = audioChunks
    .filter((a) => a.transcription)
    .map((a) => a.transcription)
    .join("\n\n");

  // Parse analysis fields — these arrive as JSON strings from Prisma
  const analysis = session.analysis;
  const actionLog = safeParseJson(analysis?.actionLog ?? null) as ParsedActionLogEntry[] | null;
  const partsIdentified = safeParseJson(analysis?.partsIdentified ?? null) as ParsedPart[] | null;
  const procedureStepsRaw = safeParseJson(analysis?.procedureSteps ?? null) as ProcedureStepInput[] | null;
  const procedureSteps = normalizeProcedureSteps(procedureStepsRaw);
  const anomalies = safeParseJson(analysis?.anomalies ?? null) as ParsedAnomaly[] | null;

  // Compute session duration for summary
  const sessionDurationMs = session.completedAt
    ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
    : null;
  const sessionDurationStr = sessionDurationMs
    ? `${Math.round(sessionDurationMs / 60000)} min`
    : "In progress";

  // Count completed procedure steps
  const completedSteps = procedureSteps?.filter((s) => s.completed).length ?? 0;
  const totalSteps = procedureSteps?.length ?? 0;
  const reviewerCockpit = deriveReviewerCockpitSummary(
    session.documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      lowConfidenceFields: doc.lowConfidenceFields,
      verificationJson: doc.verificationJson,
      evidenceLineage: doc.evidenceLineage,
      provenanceJson: doc.provenanceJson,
      reviewNotes: doc.reviewNotes,
    }))
  );
  const visibleBlockers = showAllBlockers
    ? reviewerCockpit.blockers
    : reviewerCockpit.blockers.slice(0, 6);
  const progressState = session.processingProgress?.userFacingState;
  const progressBadgeClass =
    (progressState && PROGRESS_STATE_COLORS[progressState]) ||
    "bg-slate-100 text-slate-700";
  const activeInternalStage = session.processingProgress?.internalStage;
  const progressCopy =
    progressState === "Verified"
      ? "AI verification is complete. This session is ready for human review."
      : progressState === "Packaged"
      ? "All asynchronous deliverables are assembled into a package manifest."
      : progressState === "Drafting"
      ? "Background AI is drafting documents and preparing reviewer artifacts."
      : progressState === "Captured"
      ? "Evidence is saved. Background AI processing is queued or analyzing."
      : null;

  async function handleApproveReadyDocuments() {
    if (!session) return;

    const readyDocs = session.documents.filter(
      (doc) => reviewerCockpit.documents[doc.id]?.readyToApprove
    );

    if (readyDocs.length === 0) return;

    setBulkApproving(true);
    try {
      for (const doc of readyDocs) {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/review`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id, action: "approve" }),
        });

        if (!res.ok) {
          throw new Error(`Failed to approve ${doc.id}`);
        }
      }

      await fetchSession();
    } catch (err) {
      console.error("Bulk approve failed:", err);
    } finally {
      setBulkApproving(false);
    }
  }

  function focusDocument(docId: string, fieldKey?: string | null) {
    setExpandedDoc(docId);
    void fetchDocumentProvenance(docId);

    requestAnimationFrame(() => {
      const targetId = fieldKey ? fieldAnchorId(docId, fieldKey) : `document-${docId}`;
      const target = document.getElementById(targetId) || document.getElementById(`document-${docId}`);

      target?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      if (fieldKey) {
        setActiveEvidenceField({ docId, fieldKey });
      }
    });
  }

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
              Reject Document
            </h3>
            <p className="text-sm mb-4" style={{ color: "rgb(100, 100, 100)" }}>
              Add optional notes explaining why this document is being rejected.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Rejection notes (optional)..."
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
                  "Reject"
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
      <div className="mb-8">
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
                  ? SESSION_STATUS_COLORS[
                      session.status as keyof typeof SESSION_STATUS_COLORS
                    ] || "bg-slate-100 text-slate-700"
                  : progressBadgeClass
              }`}
            >
              {session.status === "approved" && <CheckCircle2 className="h-4 w-4" />}
              {session.status === "rejected" && <XCircle className="h-4 w-4" />}
              {session.status === "approved" || session.status === "rejected"
                ? SESSION_STATUS_LABELS[
                    session.status as keyof typeof SESSION_STATUS_LABELS
                  ] || session.status
                : progressState ||
                  (SESSION_STATUS_LABELS[
                    session.status as keyof typeof SESSION_STATUS_LABELS
                  ] || session.status)}
            </span>
            {progressState && activeInternalStage && (
              <p className="text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                AI stage: {activeInternalStage}
              </p>
            )}
            <PollStatusBadge poll={sessionPoll} isPolling={isPollingEnabled} />
          </div>
        </div>
        <div className="flex gap-6 mt-4 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatDate(session.startedAt)}
          </span>
          <span>Duration: {formatDuration(session.startedAt, session.completedAt)}</span>
          <span>{session.evidence.length} evidence items</span>
          <span>{session.documents.length} documents</span>
        </div>
        {session.description && (
          <p className="mt-3 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
            {session.description}
          </p>
        )}
        {session.componentId && (
          <Link
            href={`/parts/${session.componentId}`}
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium hover:underline"
            style={{ color: "rgb(59, 130, 246)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Linked Component
          </Link>
        )}
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
            {progressCopy && (
              <p className="mt-2 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
                {progressCopy}
              </p>
            )}
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

      {/* ═══ LIVE CAPTURE PANEL — shown when session is actively capturing ═══ */}
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

      {/* ═══ REVIEWER COCKPIT ═══ */}
      <Card className="border-0 shadow-sm mb-6" data-demo-focus="reviewer-cockpit">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
                <Shield className="h-5 w-5" /> Reviewer Cockpit
              </CardTitle>
              <p className="text-sm mt-1" style={{ color: "rgb(100, 100, 100)" }}>
                Review readiness, blockers, and the next document to approve from one place.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
                style={{
                  backgroundColor:
                    reviewerCockpit.readiness === "Review Complete"
                      ? "rgb(220, 252, 231)"
                      : reviewerCockpit.readiness === "Blocked"
                      ? "rgb(254, 242, 242)"
                      : reviewerCockpit.readiness === "Awaiting Documents"
                      ? "rgb(241, 245, 249)"
                      : "rgb(239, 246, 255)",
                  color:
                    reviewerCockpit.readiness === "Review Complete"
                      ? "rgb(21, 128, 61)"
                      : reviewerCockpit.readiness === "Blocked"
                      ? "rgb(185, 28, 28)"
                      : reviewerCockpit.readiness === "Awaiting Documents"
                      ? "rgb(71, 85, 105)"
                      : "rgb(29, 78, 216)",
                }}
              >
                {reviewerCockpit.readiness === "Blocked" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : reviewerCockpit.readiness === "Review Complete" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <FileCheck className="h-4 w-4" />
                )}
                {reviewerCockpit.readiness}
              </span>
              {reviewerCockpit.nextDocumentId && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => focusDocument(reviewerCockpit.nextDocumentId as string)}
                >
                  Review Next Document
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {reviewerCockpit.counts.readyToApprove > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={bulkApproving}
                  onClick={handleApproveReadyDocuments}
                >
                  {bulkApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve All Ready ({reviewerCockpit.counts.readyToApprove})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7">
            {[
              {
                label: "Documents",
                value: reviewerCockpit.counts.totalDocuments,
                tone: "rgb(20, 20, 20)",
              },
              {
                label: "Evidence Items",
                value: session.evidence.length,
                tone: "rgb(71, 85, 105)",
              },
              {
                label: "Pending Review",
                value: reviewerCockpit.counts.pendingReview,
                tone: "rgb(29, 78, 216)",
              },
              {
                label: "Approved",
                value: reviewerCockpit.counts.approved,
                tone: "rgb(21, 128, 61)",
              },
              {
                label: "Rejected",
                value: reviewerCockpit.counts.rejected,
                tone: "rgb(185, 28, 28)",
              },
              {
                label: "High-Risk Fields",
                value: reviewerCockpit.counts.highRiskFields,
                tone: "rgb(217, 119, 6)",
              },
              {
                label: "Docs With Blockers",
                value: reviewerCockpit.counts.docsWithBlockers,
                tone: reviewerCockpit.counts.docsWithBlockers > 0 ? "rgb(185, 28, 28)" : "rgb(71, 85, 105)",
              },
              {
                label: "Ready To Approve",
                value: reviewerCockpit.counts.readyToApprove,
                tone: reviewerCockpit.counts.readyToApprove > 0 ? "rgb(21, 128, 61)" : "rgb(71, 85, 105)",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-xl p-4" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "rgb(120, 120, 120)" }}>{item.label}</p>
                <p className="text-2xl font-bold" style={{ color: item.tone }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-xl border p-4" style={{ borderColor: "rgb(235, 235, 235)" }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold" style={{ color: "rgb(40, 40, 40)" }}>Review Blockers</h3>
                <span className="text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                  {reviewerCockpit.blockers.length} item{reviewerCockpit.blockers.length === 1 ? "" : "s"}
                </span>
              </div>
              {reviewerCockpit.blockers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm" style={{ borderColor: "rgb(220, 220, 220)", color: "rgb(100, 100, 100)" }}>
                  No blockers detected. Documents are ready for reviewer approval.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleBlockers.map((blocker) => {
                    const doc = session.documents.find((item) => item.id === blocker.docId);
                    const severityColors = {
                      critical: {
                        bg: "rgb(254, 242, 242)",
                        border: "rgb(252, 165, 165)",
                        text: "rgb(185, 28, 28)",
                      },
                      warning: {
                        bg: "rgb(255, 251, 235)",
                        border: "rgb(253, 224, 71)",
                        text: "rgb(180, 83, 9)",
                      },
                      info: {
                        bg: "rgb(239, 246, 255)",
                        border: "rgb(191, 219, 254)",
                        text: "rgb(29, 78, 216)",
                      },
                    }[blocker.severity];

                    return (
                      <button
                        key={blocker.id}
                        className="w-full rounded-lg border p-3 text-left transition-colors hover:opacity-90"
                        style={{
                          backgroundColor: severityColors.bg,
                          borderColor: severityColors.border,
                        }}
                        onClick={() => focusDocument(blocker.docId, blocker.fieldKey)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                                style={{
                                  backgroundColor: `${severityColors.text}18`,
                                  color: severityColors.text,
                                }}
                              >
                                {blocker.severity}
                              </span>
                              <span className="text-xs font-medium" style={{ color: "rgb(70, 70, 70)" }}>
                                {doc ? (DOC_TYPE_LABELS[doc.documentType] || doc.documentType) : "Document"}
                              </span>
                            </div>
                            <p className="text-sm font-medium" style={{ color: "rgb(35, 35, 35)" }}>
                              {blocker.message}
                            </p>
                            <p className="text-xs mt-1" style={{ color: "rgb(110, 110, 110)" }}>
                              {blocker.fieldKey ? "Resolve blocker at field level" : "Resolve blocker in document review"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                              style={{ backgroundColor: `${severityColors.text}18`, color: severityColors.text }}
                            >
                              Resolve
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {reviewerCockpit.blockers.length > 6 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-center text-xs"
                      onClick={() => setShowAllBlockers((prev) => !prev)}
                    >
                      {showAllBlockers
                        ? "Show fewer blockers"
                        : `Show all blockers (${reviewerCockpit.blockers.length})`}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: "rgb(235, 235, 235)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "rgb(40, 40, 40)" }}>Next Actions</h3>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg p-3" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                  <p className="font-medium" style={{ color: "rgb(30, 30, 30)" }}>1. Review pending documents</p>
                  <p style={{ color: "rgb(100, 100, 100)" }}>
                    {reviewerCockpit.counts.pendingReview} document{reviewerCockpit.counts.pendingReview === 1 ? "" : "s"} still need a reviewer decision.
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                  <p className="font-medium" style={{ color: "rgb(30, 30, 30)" }}>2. Resolve blockers first</p>
                  <p style={{ color: "rgb(100, 100, 100)" }}>
                    {reviewerCockpit.counts.docsWithBlockers} document{reviewerCockpit.counts.docsWithBlockers === 1 ? "" : "s"} still have unresolved blocker states.
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                  <p className="font-medium" style={{ color: "rgb(30, 30, 30)" }}>3. Verify high-risk fields</p>
                  <p style={{ color: "rgb(100, 100, 100)" }}>
                    {reviewerCockpit.counts.highRiskFields} low-confidence field{reviewerCockpit.counts.highRiskFields === 1 ? "" : "s"} were flagged for human verification.
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                  <p className="font-medium" style={{ color: "rgb(30, 30, 30)" }}>4. Inspect evidence lineage</p>
                  <p style={{ color: "rgb(100, 100, 100)" }}>
                    Field-level evidence links remain available on every generated document field with provenance coverage.
                  </p>
                </div>
                {reviewerCockpit.counts.readyToApprove > 0 && (
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    disabled={bulkApproving}
                    onClick={handleApproveReadyDocuments}
                  >
                    {bulkApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve all ready documents
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ EXPECTED STEPS (SOP) ═══ */}
      <Card className="border-0 shadow-sm mb-6" data-demo-focus="generated-documents">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <BookOpen className="h-5 w-5" /> Expected Steps (SOP)
            </CardTitle>
            <div className="flex items-center gap-2">
              {expectedStepsSaved && (
                <span className="text-xs font-medium flex items-center gap-1" style={{ color: "rgb(34, 197, 94)" }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              {!expectedStepsEditing ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setExpectedStepsEditing(true)}>
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setExpectedStepsEditing(false);
                      setExpectedStepsText(session.expectedSteps || "");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={expectedStepsSaving}
                    onClick={handleSaveExpectedSteps}
                    className="gap-1.5"
                  >
                    {expectedStepsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {expectedStepsEditing ? (
            <div>
              <Textarea
                value={expectedStepsText}
                onChange={(e) => setExpectedStepsText(e.target.value)}
                placeholder={"Define the expected maintenance steps for this session...\n\nExample:\n1. Remove hydraulic pump from aircraft\n2. Perform receiving inspection\n3. Disassemble per CMM 29-10-01\n4. Inspect all bearings and seals\n5. Replace worn components\n6. Reassemble and torque to spec\n7. Functional test at 3000 PSI\n8. Final inspection and documentation"}
                rows={8}
                className="text-sm font-mono"
              />
              <p className="text-xs mt-2" style={{ color: "rgb(140, 140, 140)" }}>
                When no CMM is linked, the AI will verify the technician&apos;s work against these steps instead of guessing.
              </p>
            </div>
          ) : session.expectedSteps ? (
            <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "rgb(60, 60, 60)" }}>
              {session.expectedSteps}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: "rgb(160, 160, 160)" }}>
              No expected steps defined. Click &quot;Edit&quot; to add an SOP for this session.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ═══ EVIDENCE GALLERY ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <Camera className="h-5 w-5" /> Evidence ({session.evidence.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.evidence.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "rgb(140, 140, 140)" }}>
              No evidence captured in this session
            </p>
          ) : (
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
                        {/* Video annotations */}
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
                                    // Find the video element and seek to the annotation timestamp
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
          )}
        </CardContent>
      </Card>

      {/* ═══ SESSION SUMMARY ═══ */}
      {analysis && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Sparkles className="h-5 w-5" /> Session Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {/* Duration */}
              <div className="rounded-lg p-4" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "rgb(120, 120, 120)" }}>Duration</p>
                <p className="text-lg font-bold" style={{ color: "rgb(20, 20, 20)" }}>{sessionDurationStr}</p>
              </div>
              {/* Evidence */}
              <div className="rounded-lg p-4" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "rgb(120, 120, 120)" }}>Evidence</p>
                <p className="text-lg font-bold" style={{ color: "rgb(20, 20, 20)" }}>{session.evidence.length} items</p>
                <p className="text-xs mt-0.5" style={{ color: "rgb(120, 120, 120)" }}>
                  {photos.length} photo{photos.length !== 1 ? "s" : ""}, {videos.length} video{videos.length !== 1 ? "s" : ""}, {audioChunks.length} audio
                </p>
              </div>
              {/* Procedure Steps */}
              {totalSteps > 0 && (
                <div className="rounded-lg p-4" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "rgb(120, 120, 120)" }}>Steps Completed</p>
                  <p className="text-lg font-bold" style={{ color: completedSteps === totalSteps ? "rgb(34, 197, 94)" : "rgb(20, 20, 20)" }}>
                    {completedSteps}/{totalSteps}
                  </p>
                  <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgb(230, 230, 230)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((completedSteps / totalSteps) * 100)}%`,
                        backgroundColor: completedSteps === totalSteps ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)",
                      }}
                    />
                  </div>
                </div>
              )}
              {/* Anomalies */}
              <div className="rounded-lg p-4" style={{ backgroundColor: "rgb(248, 250, 252)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "rgb(120, 120, 120)" }}>Anomalies</p>
                <p className="text-lg font-bold" style={{ color: anomalies && anomalies.length > 0 ? "rgb(239, 68, 68)" : "rgb(34, 197, 94)" }}>
                  {anomalies?.length ?? 0}
                </p>
                {anomalies && anomalies.length > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: "rgb(120, 120, 120)" }}>
                    {anomalies.filter((a) => a.severity === "critical").length} critical, {anomalies.filter((a) => a.severity === "warning").length} warning
                  </p>
                )}
              </div>
            </div>

            {/* Work performed summary — from first 4 action log entries */}
            {actionLog && actionLog.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2" style={{ color: "rgb(60, 60, 60)" }}>Work Performed</h4>
                <ul className="space-y-1 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
                  {actionLog.slice(0, 4).map((entry, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span style={{ color: "rgb(59, 130, 246)" }}>•</span>
                      <span>{entry.action}</span>
                    </li>
                  ))}
                  {actionLog.length > 4 && (
                    <li className="text-xs" style={{ color: "rgb(140, 140, 140)" }}>
                      +{actionLog.length - 4} more actions recorded
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Parts identified badges */}
            {partsIdentified && partsIdentified.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2" style={{ color: "rgb(60, 60, 60)" }}>Components Touched</h4>
                <div className="flex flex-wrap gap-2">
                  {partsIdentified.map((part, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: "rgb(230, 245, 230)", color: "rgb(30, 100, 30)" }}>
                      {part.partNumber || String(part)}
                      {typeof part === "object" && part.serialNumber && (
                        <span className="opacity-70">/ {part.serialNumber}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI confidence */}
            <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: "rgb(100, 100, 100)" }}>
              <Brain className="h-4 w-4" />
              <span>AI Confidence:</span>
              <span className="font-bold" style={{ color: confidenceColor(analysis.confidence) }}>
                {Math.round(analysis.confidence * 100)}%
              </span>
              <span className="text-xs">({analysis.modelUsed})</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ KEY EVENTS TIMELINE ═══ */}
      {actionLog && actionLog.length > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Clock className="h-5 w-5" /> Key Events ({actionLog.length + (anomalies?.length ?? 0)})
            </CardTitle>
            <p className="text-xs mt-1" style={{ color: "rgb(120, 120, 120)" }}>
              Timestamped actions and anomalies observed by AI — click to expand
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {/* Merge action log + anomalies chronologically */}
              {(() => {
                const merged: Array<{ type: "action"; data: ParsedActionLogEntry } | { type: "anomaly"; data: ParsedAnomaly }> = [];
                for (const entry of actionLog) {
                  merged.push({ type: "action", data: entry });
                }
                for (const anomaly of (anomalies ?? [])) {
                  merged.push({ type: "anomaly", data: anomaly });
                }
                merged.sort((a, b) => {
                  const tsA = a.type === "action" ? a.data.timestamp : (a.data.timestamp ?? 0);
                  const tsB = b.type === "action" ? b.data.timestamp : (b.data.timestamp ?? 0);
                  return tsA - tsB;
                });

                return merged.map((item, i) => {
                  const isAnomaly = item.type === "anomaly";
                  const timestamp = isAnomaly ? (item.data.timestamp ?? 0) : (item.data as ParsedActionLogEntry).timestamp;
                  const title = isAnomaly ? item.data.description : (item.data as ParsedActionLogEntry).action;
                  const details = !isAnomaly ? (item.data as ParsedActionLogEntry).details : undefined;
                  const severity = isAnomaly ? (item.data as ParsedAnomaly).severity : null;

                  // Icon selection based on action text
                  const getIcon = () => {
                    if (isAnomaly) {
                      if (severity === "critical") return <AlertTriangle className="h-4 w-4" />;
                      if (severity === "warning") return <AlertCircle className="h-4 w-4" />;
                      return <Info className="h-4 w-4" />;
                    }
                    const lower = title.toLowerCase();
                    if (lower.includes("remov") || lower.includes("disassembl")) return <CircleMinus className="h-4 w-4" />;
                    if (lower.includes("install") || lower.includes("reassembl")) return <CirclePlus className="h-4 w-4" />;
                    if (lower.includes("inspect") || lower.includes("check") || lower.includes("examin")) return <Search className="h-4 w-4" />;
                    if (lower.includes("test") || lower.includes("run")) return <CirclePlay className="h-4 w-4" />;
                    if (lower.includes("clean") || lower.includes("flush")) return <Droplet className="h-4 w-4" />;
                    if (lower.includes("repair") || lower.includes("weld")) return <Hammer className="h-4 w-4" />;
                    if (lower.includes("replace") || lower.includes("swap")) return <ArrowRightLeft className="h-4 w-4" />;
                    return <Wrench className="h-4 w-4" />;
                  };

                  const severityColors: Record<string, { bg: string; text: string; border: string }> = {
                    info: { bg: "rgb(239, 246, 255)", text: "rgb(37, 99, 235)", border: "rgb(191, 219, 254)" },
                    warning: { bg: "rgb(255, 251, 235)", text: "rgb(217, 119, 6)", border: "rgb(253, 224, 71)" },
                    critical: { bg: "rgb(254, 242, 242)", text: "rgb(220, 38, 38)", border: "rgb(252, 165, 165)" },
                  };
                  const sev = severity ? severityColors[severity] : null;

                  // Cross-reference: find parts mentioned in this action
                  const relatedParts = !isAnomaly && partsIdentified
                    ? partsIdentified.filter((p) => {
                        const text = `${title} ${details || ""}`.toLowerCase();
                        const desc = p.description || p.type || "";
                        return text.includes(p.partNumber.toLowerCase()) ||
                          (p.serialNumber && text.includes(p.serialNumber.toLowerCase())) ||
                          (desc && text.includes(desc.toLowerCase()));
                      })
                    : [];

                  return (
                    <details key={i} className="group">
                      <summary
                        className="flex items-center gap-3 p-3 rounded-lg cursor-pointer list-none transition-colors hover:bg-slate-50"
                        style={{
                          backgroundColor: sev ? sev.bg : undefined,
                          border: sev ? `1px solid ${sev.border}` : "1px solid rgb(240, 240, 240)",
                          borderRadius: "10px",
                        }}
                      >
                        {/* Timestamp pill */}
                        <span className="font-mono text-xs font-bold shrink-0 px-2 py-0.5 rounded-md" style={{ backgroundColor: "rgb(240, 240, 240)", color: "rgb(100, 100, 100)" }}>
                          {formatTimestamp(timestamp)}
                        </span>

                        {/* Icon */}
                        <span
                          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
                          style={{
                            backgroundColor: sev ? `${sev.text}20` : "rgb(239, 246, 255)",
                            color: sev ? sev.text : "rgb(59, 130, 246)",
                          }}
                        >
                          {getIcon()}
                        </span>

                        {/* Title + severity badge */}
                        <div className="flex-1 min-w-0">
                          {severity && (
                            <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded mb-0.5 mr-2" style={{ backgroundColor: `${sev!.text}20`, color: sev!.text }}>
                              {severity}
                            </span>
                          )}
                          <span className="text-sm font-medium" style={{ color: "rgb(30, 30, 30)" }}>
                            {title}
                          </span>
                        </div>

                        {/* Expand chevron */}
                        {(details || relatedParts.length > 0) && (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" style={{ color: "rgb(160, 160, 160)" }} />
                        )}
                      </summary>

                      {/* Expanded details */}
                      {(details || relatedParts.length > 0) && (
                        <div className="ml-[88px] mt-1 mb-2 text-xs space-y-2" style={{ color: "rgb(100, 100, 100)" }}>
                          {details && <p>{details}</p>}
                          {relatedParts.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold" style={{ color: "rgb(120, 120, 120)" }}>Parts:</span>
                              {relatedParts.map((part, pi) => (
                                <span key={pi} className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "rgb(230, 245, 250)", color: "rgb(30, 100, 160)" }}>
                                  {part.partNumber}{part.serialNumber ? ` / ${part.serialNumber}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </details>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ PROCEDURE STEPS ═══ */}
      {procedureSteps && procedureSteps.length > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <FileCheck className="h-5 w-5" /> Procedure Steps ({completedSteps}/{totalSteps})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1" style={{ color: "rgb(120, 120, 120)" }}>
                <span>{completedSteps} of {totalSteps} steps completed</span>
                <span className="font-bold" style={{ color: completedSteps === totalSteps ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)" }}>
                  {Math.round((completedSteps / totalSteps) * 100)}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgb(230, 230, 230)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((completedSteps / totalSteps) * 100)}%`,
                    backgroundColor: completedSteps === totalSteps ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)",
                  }}
                />
              </div>
            </div>

            {/* Step list */}
            <div className="space-y-0">
              {procedureSteps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-3"
                  style={{
                    borderTop: i > 0 ? "1px solid rgb(245, 245, 245)" : undefined,
                  }}
                >
                  {/* Step number / checkmark */}
                  <div
                    className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: step.completed ? "rgb(220, 252, 231)" : "rgb(241, 245, 249)",
                      color: step.completed ? "rgb(34, 197, 94)" : "rgb(148, 163, 184)",
                    }}
                  >
                    {step.completed ? "✓" : step.stepNumber || i + 1}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm"
                      style={{
                        color: step.completed ? "rgb(30, 30, 30)" : "rgb(100, 100, 100)",
                        fontWeight: step.completed ? 500 : 400,
                      }}
                    >
                      {step.description || String(step)}
                    </p>
                    {step.cmmReference && (
                      <p className="flex items-center gap-1 mt-1 text-xs" style={{ color: "rgb(140, 140, 140)" }}>
                        <BookOpen className="h-3 w-3" />
                        CMM: {step.cmmReference}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ ANOMALIES ═══ */}
      {anomalies && anomalies.length > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(180, 80, 0)" }}>
              <AlertTriangle className="h-5 w-5" /> Anomalies ({anomalies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {anomalies.map((anomaly, i) => {
                const sevColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
                  critical: { bg: "rgb(254, 242, 242)", text: "rgb(220, 38, 38)", icon: <AlertTriangle className="h-4 w-4" /> },
                  warning: { bg: "rgb(255, 251, 235)", text: "rgb(217, 119, 6)", icon: <AlertCircle className="h-4 w-4" /> },
                  info: { bg: "rgb(239, 246, 255)", text: "rgb(37, 99, 235)", icon: <Info className="h-4 w-4" /> },
                };
                const sev = sevColors[anomaly.severity] || sevColors.info;

                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                    style={{ backgroundColor: sev.bg, borderColor: `${sev.text}30` }}
                  >
                    <span style={{ color: sev.text }} className="shrink-0 mt-0.5">{sev.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: `${sev.text}15`, color: sev.text }}>
                          {anomaly.severity}
                        </span>
                        {anomaly.timestamp !== undefined && anomaly.timestamp !== null && (
                          <span className="text-xs font-mono" style={{ color: "rgb(140, 140, 140)" }}>
                            at {formatTimestamp(anomaly.timestamp)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm" style={{ color: sev.text }}>
                        {anomaly.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ AI ANALYSIS META ═══ */}
      {analysis && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Brain className="h-5 w-5" /> AI Analysis Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs" style={{ color: "rgb(100, 100, 100)" }}>
              <div>
                <p className="font-semibold mb-0.5">Overall Confidence</p>
                <p className="text-base font-bold" style={{ color: confidenceColor(analysis.confidence) }}>
                  {Math.round(analysis.confidence * 100)}%
                </p>
              </div>
              <div>
                <p className="font-semibold mb-0.5">Model Used</p>
                <p className="text-sm" style={{ color: "rgb(40, 40, 40)" }}>{analysis.modelUsed}</p>
              </div>
              {analysis.processingTime && (
                <div>
                  <p className="font-semibold mb-0.5">Processing Time</p>
                  <p className="text-sm" style={{ color: "rgb(40, 40, 40)" }}>{(analysis.processingTime / 1000).toFixed(1)}s</p>
                </div>
              )}
              {analysis.costEstimate && (
                <div>
                  <p className="font-semibold mb-0.5">Estimated Cost</p>
                  <p className="text-sm" style={{ color: "rgb(40, 40, 40)" }}>${analysis.costEstimate.toFixed(3)}</p>
                </div>
              )}
            </div>

            {/* Parts identified with details */}
            {partsIdentified && partsIdentified.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3" style={{ color: "rgb(60, 60, 60)" }}>Parts Identified ({partsIdentified.length})</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  {partsIdentified.map((part, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: "rgb(230, 230, 230)" }}>
                      <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full" style={{ backgroundColor: "rgb(230, 245, 230)", color: "rgb(30, 100, 30)" }}>
                        <Wrench className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: "rgb(30, 30, 30)" }}>
                          {part.partNumber || String(part)}
                        </p>
                        {typeof part === "object" && (
                          <>
                            {part.serialNumber && (
                              <p className="text-xs" style={{ color: "rgb(100, 100, 100)" }}>S/N: {part.serialNumber}</p>
                            )}
                            {(part.description || part.type) && (
                              <p className="text-xs" style={{ color: "rgb(100, 100, 100)" }}>{part.description || part.type}</p>
                            )}
                            {part.confidence !== undefined && (
                              <p className="text-xs mt-1">
                                <span style={{ color: confidenceColor(part.confidence) }} className="font-medium">
                                  {Math.round(part.confidence * 100)}% confidence
                                </span>
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ FULL TRANSCRIPT ═══ */}
      {fullTranscript && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Mic className="h-5 w-5" /> Full Transcript
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" style={{ color: "rgb(60, 60, 60)" }}>
              {fullTranscript}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ GENERATED DOCUMENTS ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <FileText className="h-5 w-5" /> Generated Documents ({session.documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Create New Document button — always visible */}
          <div className="flex justify-end mb-4">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowCreateDoc(!showCreateDoc)}
            >
              <Plus className="h-3.5 w-3.5" /> Create New Document
            </Button>
          </div>

          {/* Create Document Panel */}
          {showCreateDoc && (
            <div className="border rounded-lg p-4 mb-4" style={{ borderColor: "rgb(220, 220, 220)", backgroundColor: "rgb(252, 252, 252)" }}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "rgb(20, 20, 20)" }}>
                <FilePlus2 className="h-4 w-4" /> Create a New Document
              </h3>
              <p className="text-xs mb-4" style={{ color: "rgb(120, 120, 120)" }}>
                Select a document type and optionally describe what you need. The AI will generate the document using your session evidence.
              </p>

              {/* Document type selection */}
              <div className="space-y-2 mb-4">
                {Object.entries(DOC_TYPE_LABELS).map(([type, label]) => {
                  const descriptions: Record<string, string> = {
                    "8130-3": "Authorized Release Certificate for returning a part to service after maintenance.",
                    "337": "Required when major repairs or alterations have been performed.",
                    "8010-4": "Report malfunctions or defects found during maintenance.",
                  };
                  const isSelected = selectedDocType === type;
                  return (
                    <button
                      key={type}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                      onClick={() => setSelectedDocType(isSelected ? null : type)}
                    >
                      <div className="flex items-center gap-2">
                        <FileCheck className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-gray-400"}`} />
                        <span className="text-sm font-medium" style={{ color: "rgb(20, 20, 20)" }}>{label}</span>
                      </div>
                      <p className="text-xs mt-1 ml-6" style={{ color: "rgb(120, 120, 120)" }}>
                        {descriptions[type]}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Description input */}
              {selectedDocType && (
                <div className="mb-4">
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "rgb(80, 80, 80)" }}>
                    Description (optional)
                  </label>
                  <Textarea
                    placeholder="Describe any specific details for this document... e.g. 'Hydraulic pump overhaul with bearing replacement, all tests passed per CMM 29-10-01'"
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              )}

              {createError && (
                <p className="text-xs text-red-600 mb-3">{createError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setShowCreateDoc(false); setSelectedDocType(null); setDocDescription(""); setCreateError(null); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedDocType || creatingDoc}
                  onClick={handleCreateDocument}
                  className="gap-1.5"
                >
                  {creatingDoc ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Generate Document</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {session.documents.length === 0 && !showCreateDoc ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: "rgb(200, 200, 200)" }} />
              <p className="text-sm font-medium mb-1" style={{ color: "rgb(100, 100, 100)" }}>
                No documents generated yet
              </p>
              <p className="text-xs mb-4" style={{ color: "rgb(160, 160, 160)" }}>
                Create a document manually or retry auto-generation with more evidence.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateDoc(true)}>
                <Plus className="h-3.5 w-3.5" /> Create New Document
              </Button>
            </div>
          ) : session.documents.length === 0 ? null : (
            <div className="space-y-4">
              {session.documents.map((doc) => {
                const isExpanded = expandedDoc === doc.id;
                const contentFields = safeParseJson(doc.contentJson) as Record<string, string> | null;
                const lowFields = safeParseJson(doc.lowConfidenceFields) as string[] | null;
                const lineage = safeParseJson(doc.evidenceLineage) as Record<string, EvidenceLineageEntry> | null;
                const verification = safeParseJson(doc.verificationJson) as VerificationData | null;
                const provenance = documentProvenance[doc.id];
                const provenanceLoading = !!loadingProvenance[doc.id];
                const fieldSections = contentFields
                  ? getDocumentFieldSections(doc.documentType, contentFields)
                  : [];
                const docSummary = reviewerCockpit.documents[doc.id];
                const docHasBlockers = (docSummary?.blockerCount || 0) > 0;
                const docReadyToApprove = !!docSummary?.readyToApprove;
                const isEditable = doc.status === "draft" || doc.status === "pending_review";
                const docEditedFields = editedFields[doc.id];
                const reviewState = parseDocumentReviewState(doc.reviewNotes);
                const rejectionNote = reviewState.rejectionNote;
                const fieldDispositions = reviewState.fieldDispositions;
                const verificationIssues = [
                  ...(verification?.issues || []),
                  ...((verification?.documentReviews || []).flatMap((review) => review.issues || [])),
                ];
                const issuesByField = verificationIssues.reduce<Record<string, VerificationIssue[]>>((acc, issue) => {
                  if (!issue.field) return acc;
                  acc[issue.field] = [...(acc[issue.field] || []), issue];
                  return acc;
                }, {});

                // Source badge icons and colors for evidence lineage
                const sourceConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
                  photo_extraction: { icon: <Camera className="h-2.5 w-2.5" />, label: "Photo", color: "rgb(37, 99, 235)", bg: "rgb(239, 246, 255)" },
                  video_analysis: { icon: <Video className="h-2.5 w-2.5" />, label: "Video", color: "rgb(124, 58, 237)", bg: "rgb(245, 243, 255)" },
                  video_annotation: { icon: <Eye className="h-2.5 w-2.5" />, label: "Video Tag", color: "rgb(124, 58, 237)", bg: "rgb(245, 243, 255)" },
                  audio_transcript: { icon: <Mic className="h-2.5 w-2.5" />, label: "Audio", color: "rgb(14, 116, 144)", bg: "rgb(236, 254, 255)" },
                  cmm_reference: { icon: <BookOpen className="h-2.5 w-2.5" />, label: "CMM", color: "rgb(21, 128, 61)", bg: "rgb(240, 253, 244)" },
                  ai_inferred: { icon: <Sparkles className="h-2.5 w-2.5" />, label: "AI Inferred", color: "rgb(217, 119, 6)", bg: "rgb(255, 251, 235)" },
                };

                return (
                  <div
                    key={doc.id}
                    id={`document-${doc.id}`}
                    className="border rounded-lg overflow-hidden"
                    style={{ borderColor: "rgb(230, 230, 230)" }}
                  >
                    {/* Document header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => {
                        const nextExpanded = isExpanded ? null : doc.id;
                        setExpandedDoc(nextExpanded);
                        if (nextExpanded) {
                          void fetchDocumentProvenance(doc.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-slate-400">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "rgb(20, 20, 20)" }}>
                            {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                            <span>
                              Confidence:{" "}
                              <span className="font-bold" style={{ color: confidenceColor(doc.confidence) }}>
                                {Math.round(doc.confidence * 100)}%
                              </span>
                            </span>
                            {(docSummary?.lowConfidenceCount || 0) > 0 && (
                              <span className="flex items-center gap-1" style={{ color: "rgb(202, 138, 4)" }}>
                                <AlertTriangle className="h-3 w-3" />
                                {docSummary?.lowConfidenceCount} low-confidence field{docSummary?.lowConfidenceCount === 1 ? "" : "s"}
                              </span>
                            )}
                            {reviewerCockpit.documents[doc.id]?.verificationIssueCount ? (
                              <span className="flex items-center gap-1" style={{ color: "rgb(220, 38, 38)" }}>
                                <Shield className="h-3 w-3" />
                                {reviewerCockpit.documents[doc.id]?.verificationIssueCount} verification issue{reviewerCockpit.documents[doc.id]?.verificationIssueCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                            {reviewerCockpit.documents[doc.id]?.provenanceFieldCount ? (
                              <span className="flex items-center gap-1" style={{ color: "rgb(37, 99, 235)" }}>
                                <ArrowRightLeft className="h-3 w-3" />
                                {reviewerCockpit.documents[doc.id]?.provenanceFieldCount} evidence-linked field{reviewerCockpit.documents[doc.id]?.provenanceFieldCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                            {reviewerCockpit.documents[doc.id]?.provenanceDiscrepancyCount ? (
                              <span className="flex items-center gap-1" style={{ color: "rgb(180, 83, 9)" }}>
                                <AlertTriangle className="h-3 w-3" />
                                {reviewerCockpit.documents[doc.id]?.provenanceDiscrepancyCount}{" "}
                                {reviewerCockpit.documents[doc.id]?.provenanceDiscrepancyCount === 1
                                  ? "provenance discrepancy"
                                  : "provenance discrepancies"}
                              </span>
                            ) : null}
                            <span>{formatDate(doc.generatedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {docReadyToApprove && (
                          <span
                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                            style={{ backgroundColor: "rgb(220, 252, 231)", color: "rgb(21, 128, 61)" }}
                          >
                            Ready to approve
                          </span>
                        )}
                        {docHasBlockers && (
                          <span
                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                            style={{ backgroundColor: "rgb(254, 242, 242)", color: "rgb(185, 28, 28)" }}
                          >
                            Resolve blockers
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            DOCUMENT_STATUS_COLORS[doc.status] ||
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {DOCUMENT_STATUS_LABELS[doc.status] || doc.status}
                        </span>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t px-4 py-4" style={{ borderColor: "rgb(240, 240, 240)" }}>
                        <div
                          className="mb-4 rounded-xl border p-3"
                          style={{
                            backgroundColor: docReadyToApprove ? "rgb(240, 253, 244)" : "rgb(255, 251, 235)",
                            borderColor: docReadyToApprove ? "rgb(187, 247, 208)" : "rgb(253, 224, 71)",
                          }}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p
                                className="text-sm font-semibold"
                                style={{ color: docReadyToApprove ? "rgb(21, 128, 61)" : "rgb(161, 98, 7)" }}
                              >
                                {docReadyToApprove ? "Document is ready for certifier approval." : "Resolve blockers before approval."}
                              </p>
                              <p className="text-xs mt-1" style={{ color: "rgb(100, 100, 100)" }}>
                                {docReadyToApprove
                                  ? "Verification checks and confidence thresholds are clear for this document."
                                  : `${docSummary?.blockerCount || 0} blocker pattern${(docSummary?.blockerCount || 0) === 1 ? "" : "s"} still require reviewer attention.`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {docReadyToApprove ? (
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
                                  Approve document
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() => focusDocument(
                                    doc.id,
                                    reviewerCockpit.blockers.find((blocker) => blocker.docId === doc.id && blocker.fieldKey)?.fieldKey
                                  )}
                                >
                                  Resolve blockers
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Form fields with evidence lineage + inline editing */}
                        {contentFields && (
                          <div className="mb-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h4 className="text-xs font-semibold" style={{ color: "rgb(80, 80, 80)" }}>Form Fields</h4>
                              {provenanceLoading && (
                                <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "rgb(120, 120, 120)" }}>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Loading evidence chain...
                                </span>
                              )}
                            </div>
                            <div className="space-y-4">
                              {fieldSections.map((section) => (
                                <div key={section.title}>
                                  <div className="mb-2 flex items-center justify-between gap-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgb(120, 120, 120)" }}>
                                      {section.title}
                                    </p>
                                    <div className="h-px flex-1" style={{ backgroundColor: "rgb(235, 235, 235)" }} />
                                  </div>
                                  <div className="grid md:grid-cols-2 gap-2">
                              {section.entries.map((field) => {
                                const key = field.key;
                                const val = field.value;
                                const isLowConf = lowFields?.includes(key);
                                const fieldLineage = lineage?.[key];
                                const fieldProvenance = provenance?.provenanceByField?.[key];
                                const hasProvenance = !!fieldProvenance;
                                const provenanceCount = fieldProvenance?.sources.length || 0;
                                const hasDiscrepancy = (fieldProvenance?.discrepancies.length || 0) > 0;
                                const src = fieldLineage ? sourceConfig[fieldLineage.source] : null;
                                const isCurrentlyEditing = editingField?.docId === doc.id && editingField?.field === key;
                                const wasEdited = docEditedFields?.has(key);
                                const fieldIssues = issuesByField[key] || [];
                                const currentDisposition = fieldDispositions[key];
                                const hasOpenComposer =
                                  fieldDispositionComposer?.docId === doc.id &&
                                  fieldDispositionComposer?.fieldKey === key;
                                const dispositionSaveKey = fieldSaveKey(doc.id, key);
                                const attentionReasons = [
                                  isLowConf ? "Low confidence" : null,
                                  hasDiscrepancy ? "Provenance discrepancy" : null,
                                  fieldIssues.length > 0
                                    ? `${fieldIssues.length} verification issue${fieldIssues.length === 1 ? "" : "s"}`
                                    : null,
                                  currentDisposition?.status === "needs_additional_evidence"
                                    ? "Additional evidence requested"
                                    : null,
                                ].filter(Boolean) as string[];
                                const showDispositionPanel =
                                  attentionReasons.length > 0 || !!currentDisposition;

                                return (
                                  <div
                                    key={key}
                                    id={fieldAnchorId(doc.id, key)}
                                    className="group text-xs p-2 rounded relative"
                                    style={{
                                      backgroundColor: isLowConf ? "rgb(255, 250, 230)" : "rgb(248, 248, 248)",
                                      border: hasDiscrepancy
                                        ? "1px solid rgb(252, 165, 165)"
                                        : isLowConf
                                        ? "1px solid rgb(253, 224, 71)"
                                        : "1px solid transparent",
                                      cursor: hasProvenance && !isCurrentlyEditing ? "pointer" : "default",
                                    }}
                                    onClick={() => {
                                      if (!hasProvenance || isCurrentlyEditing) return;
                                      setActiveEvidenceField({ docId: doc.id, fieldKey: key });
                                    }}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="font-medium shrink-0 min-w-24" style={{ color: "rgb(80, 80, 80)" }}>{humanizeFieldLabel(key)}:</span>

                                      {/* Inline edit mode */}
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSaveField(doc.id, key, editingValue);
                                            }}
                                            disabled={savingField}
                                            className="p-1 rounded hover:bg-green-100"
                                            title="Save"
                                          >
                                            {savingField ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" style={{ color: "rgb(34, 197, 94)" }} />}
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingField(null);
                                              setEditingValue("");
                                            }}
                                            className="p-1 rounded hover:bg-red-100"
                                            title="Cancel"
                                          >
                                            <X className="h-3 w-3" style={{ color: "rgb(220, 50, 50)" }} />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="flex-1" style={{ color: "rgb(40, 40, 40)" }}>{val || "—"}</span>

                                          {/* Badges: low-confidence, edited, evidence source */}
                                          <div className="flex items-center gap-1 shrink-0">
                                            {wasEdited && (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: "rgb(219, 234, 254)", color: "rgb(37, 99, 235)" }}>
                                                edited
                                              </span>
                                            )}
                                            {isLowConf && <AlertTriangle className="h-3 w-3" style={{ color: "rgb(202, 138, 4)" }} />}
                                            {fieldIssues.length > 0 && (
                                              <span
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                style={{ backgroundColor: "rgb(254, 242, 242)", color: "rgb(185, 28, 28)" }}
                                                title={`${fieldIssues.length} verification issue${fieldIssues.length === 1 ? "" : "s"}`}
                                              >
                                                <Shield className="h-3 w-3" />
                                                {fieldIssues.length} issue{fieldIssues.length === 1 ? "" : "s"}
                                              </span>
                                            )}
                                            {hasProvenance && (
                                              <span
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                style={{
                                                  backgroundColor: hasDiscrepancy ? "rgb(254, 242, 242)" : "rgb(239, 246, 255)",
                                                  color: hasDiscrepancy ? "rgb(220, 38, 38)" : "rgb(37, 99, 235)",
                                                }}
                                                title={`${provenanceCount} evidence source${provenanceCount === 1 ? "" : "s"}`}
                                              >
                                                {hasDiscrepancy ? <AlertTriangle className="h-3 w-3" /> : <ArrowRightLeft className="h-3 w-3" />}
                                                {provenanceCount || 1} src
                                              </span>
                                            )}
                                            {src && fieldLineage && (
                                              <span
                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-help"
                                                style={{
                                                  backgroundColor: fieldLineage.confidence < 0.7 ? "rgb(255, 251, 235)" : src.bg,
                                                  color: fieldLineage.confidence < 0.7 ? "rgb(217, 119, 6)" : src.color,
                                                }}
                                                title={`${src.label}: ${fieldLineage.detail} (${Math.round(fieldLineage.confidence * 100)}%)`}
                                              >
                                                {src.icon} {src.label}
                                              </span>
                                            )}
                                            {currentDisposition && (
                                              <span
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                style={{
                                                  backgroundColor:
                                                    currentDisposition.status === "needs_additional_evidence"
                                                      ? "rgb(255, 251, 235)"
                                                      : "rgb(240, 253, 244)",
                                                  color:
                                                    currentDisposition.status === "needs_additional_evidence"
                                                      ? "rgb(180, 83, 9)"
                                                      : "rgb(21, 128, 61)",
                                                }}
                                              >
                                                <FileCheck className="h-3 w-3" />
                                                {getDispositionLabel(currentDisposition.status)}
                                              </span>
                                            )}
                                            {/* Edit button — only for draft/pending documents */}
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

                                    {showDispositionPanel && (
                                      <div
                                        className="mt-2 rounded-lg border p-2"
                                        style={{ backgroundColor: "white", borderColor: "rgb(228, 228, 228)" }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgb(120, 120, 120)" }}>
                                              Certifier disposition
                                            </p>
                                            <p className="text-[11px]" style={{ color: "rgb(90, 90, 90)" }}>
                                              {attentionReasons.length > 0
                                                ? `Attention: ${attentionReasons.join(", ")}.`
                                                : "Reviewer disposition recorded."}
                                            </p>
                                            {currentDisposition?.rationale && (
                                              <p className="text-[11px]" style={{ color: "rgb(100, 100, 100)" }}>
                                                Rationale: {currentDisposition.rationale}
                                              </p>
                                            )}
                                          </div>
                                          {isEditable ? (
                                            <div className="flex flex-wrap gap-2">
                                              <Button
                                                size="sm"
                                                variant={currentDisposition?.status === "manually_verified" ? "default" : "outline"}
                                                className="h-7 gap-1.5 text-[11px]"
                                                disabled={savingDispositionKey === dispositionSaveKey}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  void handleSetFieldDisposition(doc.id, key, "manually_verified");
                                                }}
                                              >
                                                {savingDispositionKey === dispositionSaveKey && !hasOpenComposer ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <CheckCircle2 className="h-3 w-3" />
                                                )}
                                                Mark verified
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant={currentDisposition?.status === "accepted_with_rationale" ? "default" : "outline"}
                                                className="h-7 gap-1.5 text-[11px]"
                                                disabled={savingDispositionKey === dispositionSaveKey}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setFieldDispositionComposer({
                                                    docId: doc.id,
                                                    fieldKey: key,
                                                    status: "accepted_with_rationale",
                                                  });
                                                  setFieldDispositionRationale(currentDisposition?.status === "accepted_with_rationale" ? currentDisposition.rationale || "" : "");
                                                }}
                                              >
                                                Accept with rationale
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant={currentDisposition?.status === "needs_additional_evidence" ? "default" : "outline"}
                                                className="h-7 gap-1.5 text-[11px]"
                                                disabled={savingDispositionKey === dispositionSaveKey}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setFieldDispositionComposer({
                                                    docId: doc.id,
                                                    fieldKey: key,
                                                    status: "needs_additional_evidence",
                                                  });
                                                  setFieldDispositionRationale(currentDisposition?.status === "needs_additional_evidence" ? currentDisposition.rationale || "" : "");
                                                }}
                                              >
                                                Request evidence
                                              </Button>
                                              {currentDisposition && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-7 text-[11px]"
                                                  disabled={savingDispositionKey === dispositionSaveKey}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleSetFieldDisposition(doc.id, key, null);
                                                  }}
                                                >
                                                  Clear
                                                </Button>
                                              )}
                                            </div>
                                          ) : (
                                            <p className="text-[11px]" style={{ color: "rgb(120, 120, 120)" }}>
                                              Dispositions are locked after final review.
                                            </p>
                                          )}
                                        </div>

                                        {hasOpenComposer && (
                                          <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "rgb(235, 235, 235)" }}>
                                            <Textarea
                                              value={fieldDispositionRationale}
                                              onChange={(e) => setFieldDispositionRationale(e.target.value)}
                                              placeholder={
                                                fieldDispositionComposer.status === "accepted_with_rationale"
                                                  ? "Explain why this field is acceptable despite the blocker."
                                                  : "Describe the evidence the technician or reviewer still needs."
                                              }
                                              className="min-h-[88px] text-xs"
                                            />
                                            <div className="mt-2 flex items-center justify-end gap-2">
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-[11px]"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setFieldDispositionComposer(null);
                                                  setFieldDispositionRationale("");
                                                }}
                                              >
                                                Cancel
                                              </Button>
                                              <Button
                                                size="sm"
                                                className="h-7 gap-1.5 text-[11px]"
                                                disabled={
                                                  savingDispositionKey === dispositionSaveKey ||
                                                  !fieldDispositionRationale.trim()
                                                }
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  void handleSetFieldDisposition(
                                                    doc.id,
                                                    key,
                                                    fieldDispositionComposer.status,
                                                    fieldDispositionRationale
                                                  );
                                                }}
                                              >
                                                {savingDispositionKey === dispositionSaveKey ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Save className="h-3 w-3" />
                                                )}
                                                Save disposition
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Verification results — structured cards */}
                        {verification && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "rgb(80, 80, 80)" }}>
                              <Shield className="h-3.5 w-3.5" /> AI Verification
                            </h4>
                            {/* Overall status bar */}
                            <div
                              className="flex items-center gap-3 p-3 rounded-lg mb-3"
                              style={{
                                backgroundColor: verification.verified !== false ? "rgb(240, 253, 244)" : "rgb(254, 242, 242)",
                                border: `1px solid ${verification.verified !== false ? "rgb(187, 247, 208)" : "rgb(252, 165, 165)"}`,
                              }}
                            >
                              {verification.verified !== false ? (
                                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "rgb(34, 197, 94)" }} />
                              ) : (
                                <XCircle className="h-5 w-5 shrink-0" style={{ color: "rgb(220, 38, 38)" }} />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium" style={{ color: verification.verified !== false ? "rgb(21, 128, 61)" : "rgb(153, 27, 27)" }}>
                                  {verification.verified !== false ? "Verification Passed" : "Issues Found"}
                                </p>
                              </div>
                              {(verification.overallConfidence ?? verification.confidence) !== undefined && (
                                <span
                                  className="text-sm font-bold"
                                  style={{ color: confidenceColor(verification.overallConfidence ?? verification.confidence ?? 0) }}
                                >
                                  {Math.round((verification.overallConfidence ?? verification.confidence ?? 0) * 100)}%
                                </span>
                              )}
                            </div>
                            {/* Issue cards */}
                            {(() => {
                              const issues = verification.issues || verification.documentReviews?.flatMap((r) => r.issues) || [];
                              if (issues.length === 0) {
                                return (
                                  <p className="text-xs py-2" style={{ color: "rgb(34, 197, 94)" }}>
                                    No issues found — all fields verified against evidence.
                                  </p>
                                );
                              }
                              const sevStyles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
                                critical: { bg: "rgb(254, 242, 242)", text: "rgb(220, 38, 38)", border: "rgb(252, 165, 165)", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
                                warning: { bg: "rgb(255, 251, 235)", text: "rgb(217, 119, 6)", border: "rgb(253, 224, 71)", icon: <AlertCircle className="h-3.5 w-3.5" /> },
                                info: { bg: "rgb(239, 246, 255)", text: "rgb(37, 99, 235)", border: "rgb(191, 219, 254)", icon: <Info className="h-3.5 w-3.5" /> },
                              };
                              return (
                                <div className="space-y-2">
                                  {issues.map((issue, i) => {
                                    const sev = sevStyles[issue.severity] || sevStyles.info;
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-start gap-2.5 p-3 rounded-lg border text-xs"
                                        style={{ backgroundColor: sev.bg, borderColor: sev.border }}
                                      >
                                        <span className="shrink-0 mt-0.5" style={{ color: sev.text }}>{sev.icon}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-bold uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${sev.text}15`, color: sev.text }}>
                                              {issue.severity}
                                            </span>
                                            <span className="font-medium" style={{ color: "rgb(60, 60, 60)" }}>{issue.field}</span>
                                          </div>
                                          <p style={{ color: "rgb(80, 80, 80)" }}>{issue.issue}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Review info */}
                        {doc.reviewedAt && (
                          <div className="mb-4 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                            Reviewed {formatDate(doc.reviewedAt)}
                            {doc.reviewedBy && ` by ${doc.reviewedBy.firstName} ${doc.reviewedBy.lastName}`}
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
                              {docReadyToApprove ? (
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
                                  Approve document
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => focusDocument(
                                    doc.id,
                                    reviewerCockpit.blockers.find((blocker) => blocker.docId === doc.id && blocker.fieldKey)?.fieldKey
                                  )}
                                  className="gap-1.5"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                  Resolve blockers
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowRejectDialog(doc.id)}
                                className="gap-1.5"
                                style={{ color: "rgb(220, 50, 50)", borderColor: "rgb(220, 50, 50)" }}
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </>
                          )}
                          {doc.status === "approved" && (
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
                          )}
                          {doc.status === "approved" && (
                            <span className="text-xs font-medium" style={{ color: "rgb(21, 128, 61)" }}>
                              Certificate-ready document approved.
                            </span>
                          )}
                          {doc.status !== "approved" && doc.status !== "rejected" && docHasBlockers && (
                            <span className="text-xs" style={{ color: "rgb(161, 98, 7)" }}>
                              Approval is intentionally gated until blockers are resolved.
                            </span>
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

      {/* ═══ AUDIT TRAIL ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setAuditOpen(!auditOpen)}
        >
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <Shield className="h-5 w-5" /> Audit Trail
            {auditOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
          </CardTitle>
        </CardHeader>
        {auditOpen && (
          <CardContent>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "rgb(140, 140, 140)" }}>
                No audit trail entries for this session
              </p>
            ) : (
              <div className="space-y-2">
                {auditEntries.map((entry) => {
                  const meta = safeParseJson(entry.metadata) as Record<string, unknown> | null;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 text-xs p-3 rounded" style={{ backgroundColor: "rgb(248, 248, 248)" }}>
                      <span className="font-mono shrink-0" style={{ color: "rgb(120, 120, 120)" }}>
                        {formatDate(entry.timestamp)}
                      </span>
                      <span className="font-medium" style={{ color: "rgb(40, 40, 40)" }}>
                        {humanizeAction(entry.action)}
                      </span>
                      {entry.user && (
                        <span style={{ color: "rgb(100, 100, 100)" }}>
                          by {entry.user.firstName} {entry.user.lastName}
                        </span>
                      )}
                      {meta && typeof meta.notes === "string" && meta.notes && (
                        <span className="italic" style={{ color: "rgb(140, 140, 140)" }}>
                          — {meta.notes}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <EvidenceChainDrawer
        open={!!activeEvidenceField}
        onOpenChange={(open) => {
          if (!open) setActiveEvidenceField(null);
        }}
        loading={!!(activeEvidenceField && loadingProvenance[activeEvidenceField.docId])}
        documentLabel={
          activeEvidenceField
            ? DOC_TYPE_LABELS[
                session.documents.find((doc) => doc.id === activeEvidenceField.docId)?.documentType || ""
              ] || session.documents.find((doc) => doc.id === activeEvidenceField.docId)?.documentType || null
            : null
        }
        fieldLabel={activeEvidenceField ? humanizeFieldLabel(activeEvidenceField.fieldKey) : null}
        fieldValue={
          activeEvidenceField
            ? documentProvenance[activeEvidenceField.docId]?.fields?.[activeEvidenceField.fieldKey]
            : null
        }
        fieldData={
          activeEvidenceField
            ? documentProvenance[activeEvidenceField.docId]?.provenanceByField?.[activeEvidenceField.fieldKey] || null
            : null
        }
      />
    </div>
  );
}
