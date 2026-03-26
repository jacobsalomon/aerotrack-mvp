"use client";

// Capture Sessions dashboard — lists all mobile capture sessions
// Shows a flat list of all sessions (mechanic self-review workflow)
// Rows are clickable — navigate to /sessions/[id] for full detail

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/api-url";
import {
  SESSION_STATUS_COLORS,
  SESSION_STATUS_LABELS,
} from "@/lib/session-status";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Smartphone,
  Camera,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Mic,
  Sparkles,
  Upload,
  Glasses,
} from "lucide-react";

// The 3 FAA forms AeroVision can auto-generate
const TARGET_FORMS = [
  {
    id: "8130-3",
    formNumber: "FAA 8130-3",
    title: "Authorized Release Certificate",
    shortDesc: "Releasing a part back to service after maintenance",
  },
  {
    id: "337",
    formNumber: "FAA 337",
    title: "Major Repair and Alteration",
    shortDesc: "Documenting a major repair or alteration",
  },
  {
    id: "8010-4",
    formNumber: "FAA 8010-4",
    title: "Malfunction or Defect Report",
    shortDesc: "Reporting a defect found during maintenance",
  },
];

const PROGRESS_STATE_COLORS: Record<string, string> = {
  Captured: "bg-cyan-100 text-cyan-700",
  Drafting: "bg-amber-100 text-amber-700",
  Verified: "bg-emerald-100 text-emerald-700",
  Packaged: "bg-sky-100 text-sky-700",
};

interface SessionData {
  id: string;
  status: string;
  description: string | null;
  startedAt: string;
  completedAt: string | null;
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    badgeNumber: string | null;
  };
  organization: { name: string };
  component: { id: string; partNumber: string; description: string } | null;
  _count: { evidence: number; documents: number };
  processingProgress: {
    userFacingState: string | null;
    running: boolean;
  } | null;
}

interface SessionLoadError {
  title: string;
  error: string;
  nextStep: string;
  technicalDetails: string;
}

function buildSessionLoadError(error: unknown): SessionLoadError {
  if (error && typeof error === "object") {
    const candidate = error as Partial<SessionLoadError>;
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
    error instanceof Error ? error.message : "Failed to load sessions.";

  return {
    title: "Sessions unavailable",
    error: "AeroVision could not load your sessions.",
    nextStep:
      "Refresh this page. If the problem persists, check your connection and try again.",
    technicalDetails: detail,
  };
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<SessionLoadError | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [creatingSession, setCreatingSession] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [orgDocuments, setOrgDocuments] = useState<{ id: string; title: string; fileSizeBytes: number }[]>([]);
  const [loadingOrgDocs, setLoadingOrgDocs] = useState(false);
  // Two-step dialog: first pick a form, then pick capture method (web mic vs glasses)
  const [selectedForm, setSelectedForm] = useState<{ targetFormType: string; orgDocumentId?: string; label: string } | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(apiUrl(`/api/sessions${params}`));
      const payload = await res.json().catch(() => null);

      // Session expired — reload to trigger login redirect
      if (res.status === 401) {
        window.location.reload();
        return;
      }

      if (!res.ok) {
        throw payload ?? new Error(`API error: ${res.status}`);
      }

      setSessions(Array.isArray(payload) ? payload : []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
      setSessions([]);
      setLoadError(buildSessionLoadError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  // Fetch org documents when the picker modal opens
  async function fetchOrgDocuments() {
    setLoadingOrgDocs(true);
    try {
      const res = await fetch(apiUrl("/api/org/documents"));
      if (res.ok) {
        const data = await res.json();
        const docs = Array.isArray(data) ? data : data.documents ?? [];
        setOrgDocuments(docs);
      }
    } catch (err) {
      console.error("Failed to fetch org documents:", err);
    } finally {
      setLoadingOrgDocs(false);
    }
  }

  // Start a new capture session with the selected target form or org document
  async function handleStartSession(targetFormType: string, orgDocumentId?: string, forGlasses?: boolean) {
    setShowFormPicker(false);
    setCreatingSession(true);
    setCreateError(null);
    const formLabel = TARGET_FORMS.find((f) => f.id === targetFormType)?.formNumber;
    const orgDocLabel = orgDocuments.find((d) => d.id === orgDocumentId)?.title;
    try {
      const res = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: orgDocLabel
            ? `Capture for ${orgDocLabel}`
            : formLabel
              ? `Capture for ${formLabel}`
              : forGlasses
                ? "Glasses capture"
                : "Web capture session",
          targetFormType: orgDocumentId ? null : (targetFormType || null),
          orgDocumentId: orgDocumentId || null,
          forGlasses: forGlasses || false,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create session");
      }
      const session = await res.json();
      router.push(`/jobs/${session.id}`);
    } catch (err) {
      console.error("Failed to start session:", err);
      setCreateError(err instanceof Error ? err.message : "Failed to start session");
      setCreatingSession(false);
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDuration(start: string, end: string | null): string {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  // Summary stats
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter(
    (s) => s.status === "capturing" || s.processingProgress?.running
  ).length;
  const inProgressSessions = sessions.filter(
    (s) => s.status !== "approved" && s.status !== "rejected" && s.status !== "capturing"
  ).length;
  const totalEvidence = sessions.reduce((sum, s) => sum + s._count.evidence, 0);

  // All sessions shown in one flat list
  const displayedSessions = sessions;

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Sessions</h1>
            <p className="text-sm mt-2" style={{ color: 'rgb(100, 100, 100)' }}>
              Your capture sessions. Open a session to review evidence and confirm documents.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Button
              onClick={() => { setShowFormPicker(true); void fetchOrgDocuments(); }}
              disabled={creatingSession}
              className="gap-2"
              style={{ backgroundColor: "rgb(239, 68, 68)", color: "white" }}
            >
              {creatingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              Start Session
            </Button>
            {createError && (
              <p className="text-xs mt-2" style={{ color: "rgb(239, 68, 68)" }}>
                {createError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {!loadError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col gap-2">
                <Smartphone className="h-6 w-6 mb-1" style={{ color: 'rgb(60, 60, 60)' }} />
                <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{totalSessions}</p>
                <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Total Sessions</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col gap-2">
                <Loader2 className="h-6 w-6 mb-1" style={{ color: 'rgb(202, 138, 4)' }} />
                <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{activeSessions}</p>
                <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Active Now</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col gap-2">
                <FileText className="h-6 w-6 mb-1" style={{ color: 'rgb(147, 51, 234)' }} />
                <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{inProgressSessions}</p>
                <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col gap-2">
                <Camera className="h-6 w-6 mb-1" style={{ color: 'rgb(34, 197, 94)' }} />
                <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{totalEvidence}</p>
                <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Evidence Items</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab bar + filter + table */}
      <Card className="border-0 shadow-sm" data-demo-focus="sessions-review-table">
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>
              {statusFilter === "all"
                ? "All Sessions"
                : SESSION_STATUS_LABELS[
                    statusFilter as keyof typeof SESSION_STATUS_LABELS
                  ] || statusFilter}
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="capturing">Capturing</SelectItem>
                <SelectItem value="capture_complete">Capture Complete</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="analysis_complete">Analysis Complete</SelectItem>
                <SelectItem value="documents_generated">Docs Ready</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : loadError ? (
            <div className="rounded-3xl border px-6 py-10 text-center" style={{ borderColor: "rgb(253, 230, 138)", backgroundColor: "rgba(255, 251, 235, 0.9)" }}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(245, 158, 11, 0.12)" }}>
                <AlertTriangle className="h-6 w-6" style={{ color: "rgb(217, 119, 6)" }} />
              </div>
              <h3 className="mt-4 text-xl font-semibold" style={{ color: "rgb(120, 53, 15)" }}>
                {loadError.title}
              </h3>
              <p className="mt-3 text-sm leading-6" style={{ color: "rgb(146, 64, 14)" }}>
                {loadError.error}
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: "rgb(146, 64, 14)" }}>
                Next step: {loadError.nextStep}
              </p>
              <div className="mt-6">
                <Button onClick={() => void fetchSessions()} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
              <p className="mt-5 text-xs font-mono" style={{ color: "rgb(180, 83, 9)" }}>
                Local detail: {loadError.technicalDetails}
              </p>
            </div>
          ) : displayedSessions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'rgb(140, 140, 140)' }}>
              <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                No capture sessions yet
              </p>
              <p className="text-xs mt-1">
                Start a capture session to begin recording maintenance work
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>Started By</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-center">Evidence</TableHead>
                    <TableHead className="text-center">Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedSessions.map((session) => {
                    const displayStatus =
                      session.status === "approved" || session.status === "rejected"
                        ? SESSION_STATUS_LABELS[
                            session.status as keyof typeof SESSION_STATUS_LABELS
                          ] || session.status
                        : session.processingProgress?.userFacingState ||
                          (SESSION_STATUS_LABELS[
                            session.status as keyof typeof SESSION_STATUS_LABELS
                          ] || session.status);
                    const displayClass =
                      session.status === "approved" || session.status === "rejected"
                        ? SESSION_STATUS_COLORS[
                            session.status as keyof typeof SESSION_STATUS_COLORS
                          ] || "bg-slate-100 text-slate-700"
                        : (session.processingProgress?.userFacingState &&
                            PROGRESS_STATE_COLORS[session.processingProgress.userFacingState]) ||
                          "bg-slate-100 text-slate-700";
                    return (
                      <TableRow
                        key={session.id}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                        onClick={() => router.push(`/jobs/${session.id}`)}
                      >
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${displayClass}`}
                          >
                            {session.status === "approved" && (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            {session.status === "rejected" && (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            {(session.status === "capturing" || session.processingProgress?.running) && (
                              <Clock className="h-3 w-3" />
                            )}
                            {displayStatus}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-[220px]">
                          {session.component ? (
                            <div>
                              <p className="font-mono font-medium text-slate-700">{session.component.partNumber}</p>
                              <p className="text-xs text-slate-400 truncate">{session.component.description}</p>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {session.user.firstName && session.user.lastName
                                ? `${session.user.firstName} ${session.user.lastName}`
                                : session.user.name || "Unknown"}
                            </p>
                            {session.user.badgeNumber && (
                              <p className="text-xs text-slate-400">
                                {session.user.badgeNumber}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatDate(session.startedAt)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatDuration(session.startedAt, session.completedAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">
                            {session._count.evidence}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">
                            {session._count.documents}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form picker dialog — two steps: 1) pick a form, 2) pick capture method */}
      <Dialog open={showFormPicker} onOpenChange={(open) => { setShowFormPicker(open); if (!open) setSelectedForm(null); }}>
        <DialogContent className="sm:max-w-md">
          {selectedForm === null ? (
            <>
              {/* Step 1: Pick a form */}
              <DialogHeader>
                <DialogTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  What are you working on?
                </DialogTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Pick the form AeroVision should auto-populate from your capture.
                </p>
              </DialogHeader>

              {/* FAA Forms */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-2">FAA Forms</p>
              <div className="grid gap-2">
                {TARGET_FORMS.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => setSelectedForm({ targetFormType: form.id, label: form.formNumber })}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        {form.formNumber}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {form.shortDesc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Internal Forms (org documents) */}
              {loadingOrgDocs ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              ) : orgDocuments.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-3">Internal Forms</p>
                  <div className="grid gap-2">
                    {orgDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedForm({ targetFormType: "", orgDocumentId: doc.id, label: doc.title })}
                        className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                          <Upload className="h-4 w-4 text-orange-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {doc.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes / 1024)} KB` : "Uploaded PDF"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <button
                onClick={() => setSelectedForm({ targetFormType: "", label: "" })}
                className="mt-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip — just record without a form
              </button>
            </>
          ) : (
            <>
              {/* Step 2: Pick capture method */}
              <DialogHeader>
                <DialogTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  How will you capture?
                </DialogTitle>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedForm.label
                    ? <>Capturing for <span className="font-semibold text-slate-700">{selectedForm.label}</span></>
                    : "No form selected — recording only"}
                </p>
              </DialogHeader>

              <div className="grid gap-2 mt-2">
                {/* Desk mic / web capture */}
                <button
                  onClick={() => void handleStartSession(selectedForm.targetFormType, selectedForm.orgDocumentId)}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Mic className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      Record on Web
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Use your desk microphone to capture audio now
                    </p>
                  </div>
                </button>

                {/* Send to glasses */}
                <button
                  onClick={() => void handleStartSession(selectedForm.targetFormType, selectedForm.orgDocumentId, true)}
                  className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-left transition-colors hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Glasses className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      Send to Glasses
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Job appears on the mechanic&apos;s glasses app automatically
                    </p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setSelectedForm(null)}
                className="mt-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                &larr; Back to form selection
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
