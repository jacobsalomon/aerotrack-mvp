"use client";

// Capture Sessions dashboard — lists all mobile capture sessions
// Two tabs: "All Sessions" and "Review Queue" (pending supervisor review)
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
  REVIEW_SESSION_STATUSES,
  SESSION_STATUS_COLORS,
  SESSION_STATUS_LABELS,
} from "@/lib/session-status";
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
} from "lucide-react";

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
  technician: {
    id: string;
    firstName: string;
    lastName: string;
    badgeNumber: string;
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
    error instanceof Error ? error.message : "Failed to load the review queue.";

  return {
    title: "Review queue unavailable",
    error: "AeroVision could not load reviewer sessions.",
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
  const [activeTab, setActiveTab] = useState<"all" | "review">("all");
  const [creatingSession, setCreatingSession] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  // Start a new capture session from the web dashboard (no glasses required)
  async function handleStartSession() {
    setCreatingSession(true);
    setCreateError(null);
    try {
      const res = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Web capture session" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create session");
      }
      const session = await res.json();
      router.push(`/sessions/${session.id}`);
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

  // Summary stats (computed from all sessions, not filtered by tab)
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter(
    (s) => s.status === "capturing" || s.processingProgress?.running
  ).length;
  const pendingReview = sessions.filter(
    (s) =>
      REVIEW_SESSION_STATUSES.includes(
        s.status as (typeof REVIEW_SESSION_STATUSES)[number]
      )
  ).length;
  const totalEvidence = sessions.reduce((sum, s) => sum + s._count.evidence, 0);

  // Filter sessions by active tab
  const displayedSessions =
    activeTab === "review"
      ? sessions.filter((s) =>
          REVIEW_SESSION_STATUSES.includes(
            s.status as (typeof REVIEW_SESSION_STATUSES)[number]
          )
        )
      : sessions;

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Review Queue</h1>
            <p className="text-sm mt-2" style={{ color: 'rgb(100, 100, 100)' }}>
              Sessions appear here as technicians capture maintenance work. Open a session to review evidence and approve documents.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Button
              onClick={() => void handleStartSession()}
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
          <Card className="border-0 shadow-sm" data-demo-focus="sessions-pending-review">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col gap-2">
                <FileText className="h-6 w-6 mb-1" style={{ color: 'rgb(147, 51, 234)' }} />
                <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{pendingReview}</p>
                <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Needs Review</p>
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
          {/* Tab bar */}
          <div className="flex gap-1 border-b" style={{ borderColor: 'rgb(230, 230, 230)' }}>
            <button
              onClick={() => setActiveTab("all")}
              className="px-4 py-2.5 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === "all" ? "rgb(20, 20, 20)" : "rgb(140, 140, 140)",
              }}
            >
              All Sessions
              {activeTab === "all" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: 'rgb(20, 20, 20)' }} />
              )}
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className="px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-2"
              style={{
                color: activeTab === "review" ? "rgb(20, 20, 20)" : "rgb(140, 140, 140)",
              }}
            >
              Review Queue
              {pendingReview > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: activeTab === "review" ? "rgb(147, 51, 234)" : "rgb(220, 220, 220)",
                    color: activeTab === "review" ? "white" : "rgb(80, 80, 80)",
                  }}
                >
                  {pendingReview}
                </span>
              )}
              {activeTab === "review" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: 'rgb(20, 20, 20)' }} />
              )}
            </button>
          </div>

          {/* Filter row — only shown on "All Sessions" tab */}
          {activeTab === "all" && (
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
          )}
          {activeTab === "review" && (
            <CardTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>
              Sessions Awaiting Review
            </CardTitle>
          )}
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
                  Retry Review Queue
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
                {activeTab === "review"
                  ? "No sessions awaiting review"
                  : "No review sessions yet"}
              </p>
              <p className="text-xs mt-1">
                {activeTab === "review"
                  ? "Sessions appear here when technicians submit completed work"
                  : "Sessions appear here when evidence packs and mobile captures are ready for reviewer follow-up"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>Technician</TableHead>
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
                        onClick={() => router.push(`/sessions/${session.id}`)}
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
                              {session.technician.firstName} {session.technician.lastName}
                            </p>
                            <p className="text-xs text-slate-400">
                              {session.technician.badgeNumber}
                            </p>
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
    </div>
  );
}
