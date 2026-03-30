"use client";

// Jobs page — unified list of all work (guided inspections + freeform captures)
// Template-first design: CMM cards shown inline for one-click job creation.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ClipboardCheck,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Search,
  Camera,
  FileText,
  Clock,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { getCmmAgeWarning } from "@/lib/inspect/cmm-config";

// ─── Status mapping (mechanic-friendly labels) ───────────────────────

type JobDisplayStatus = "In Progress" | "Ready to Review" | "Complete" | "Cancelled";

const STATUS_GROUP: Record<string, JobDisplayStatus> = {
  capturing: "In Progress",
  inspecting: "In Progress",
  processing: "Ready to Review",
  analysis_complete: "Ready to Review",
  documents_generated: "Ready to Review",
  reviewing: "Ready to Review",
  verified: "Complete",
  submitted: "Complete",
  approved: "Complete",
  signed_off: "Complete",
  cancelled: "Cancelled",
  rejected: "Cancelled",
};

const STATUS_COLORS: Record<JobDisplayStatus, string> = {
  "In Progress": "bg-blue-100 text-blue-700",
  "Ready to Review": "bg-amber-100 text-amber-700",
  "Complete": "bg-emerald-100 text-emerald-700",
  "Cancelled": "bg-slate-100 text-slate-500",
};

// Friendly labels for CMM extraction status
const TEMPLATE_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "Ready", color: "bg-emerald-100 text-emerald-700" },
  review_ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700" },
  pending_extraction: { label: "Extracting...", color: "bg-amber-100 text-amber-600" },
  extracting_index: { label: "Extracting...", color: "bg-amber-100 text-amber-600" },
  extracting_details: { label: "Extracting...", color: "bg-amber-100 text-amber-600" },
  extraction_failed: { label: "Failed", color: "bg-red-100 text-red-600" },
};

// ─── Types ────────────────────────────────────────────────────────────

interface JobSession {
  id: string;
  status: string;
  sessionType: string;
  workOrderRef: string | null;
  startedAt: string;
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    badgeNumber: string | null;
  };
  component: {
    id: string;
    partNumber: string;
    serialNumber: string | null;
    description: string;
  } | null;
}

interface LibraryTemplate {
  id: string;
  title: string;
  status: string;
  partNumbersCovered: string[];
  totalItems: number;
  createdAt: string;
  _count: { sections: number };
}

// ─── Component ────────────────────────────────────────────────────────

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Template cards
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null); // which card is loading

  // Discard job confirmation
  const [discardJobId, setDiscardJobId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // Search bar
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    component: { id: string; partNumber: string; serialNumber: string | null; description: string };
    template: { id: string; title: string; itemCount: number } | null;
  } | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  // Fetch jobs and templates in parallel on mount
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/sessions"));
      if (res.status === 401) { window.location.reload(); return; }
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(apiUrl("/api/library"));
      if (res.ok) {
        const data = await res.json();
        setTemplates((data.templates || []).filter((t: LibraryTemplate) => t.status !== "archived"));
      }
    } catch { /* silent — templates are a bonus, not critical */ }
    finally { setLoadingTemplates(false); }
  }, []);

  useEffect(() => { void fetchJobs(); void fetchTemplates(); }, [fetchJobs, fetchTemplates]);

  // ─── Discard (delete) a job ──────────────────────────────────────────

  async function handleDiscardJob() {
    if (!discardJobId) return;
    setDiscarding(true);
    try {
      const res = await fetch(apiUrl(`/api/jobs/${discardJobId}`), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed: ${res.status}`);
      }
      setJobs((prev) => prev.filter((j) => j.id !== discardJobId));
    } catch (err) {
      console.error("Failed to discard job:", err);
    } finally {
      setDiscarding(false);
      setDiscardJobId(null);
    }
  }

  // ─── One-click: start guided inspection from a template card ────────

  async function startFromTemplate(templateId: string) {
    setStartingId(templateId);
    try {
      const res = await fetch(apiUrl("/api/inspect/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) throw new Error("Failed to create job");
      const result = await res.json();
      router.push(`/jobs/${result.data.sessionId}`);
    } catch (err) {
      console.error(err);
      setStartingId(null);
    }
  }

  // ─── One-click: start freeform capture ──────────────────────────────

  async function startFreeform() {
    setStartingId("freeform");
    try {
      const res = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Web capture session" }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const session = await res.json();
      router.push(`/jobs/${session.id}`);
    } catch (err) {
      console.error(err);
      setStartingId(null);
    }
  }

  // ─── Search by WO#/serial/part number ───────────────────────────────

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchDone(false);
    try {
      const compRes = await fetch(apiUrl(`/api/components?search=${encodeURIComponent(searchQuery.trim())}`));
      if (!compRes.ok) throw new Error("Search failed");
      const compData = await compRes.json();
      const components = compData.data || [];
      if (components.length === 0) { setSearchDone(true); setSearching(false); return; }

      const comp = components[0];
      let tmpl = null;

      // Check for matching template
      const tmplRes = await fetch(apiUrl(`/api/inspect/templates?componentId=${comp.id}&partNumber=${encodeURIComponent(comp.partNumber)}`));
      if (tmplRes.ok) {
        const tmplData = await tmplRes.json();
        const tmpls = tmplData.data || [];
        if (tmpls.length > 0) {
          const t = tmpls[0];
          const itemCount = t.sections?.reduce((sum: number, s: { items: unknown[] }) => sum + (s.items?.length || 0), 0) || 0;
          tmpl = { id: t.id, title: t.title, itemCount };
        }
      }

      setSearchResult({ component: comp, template: tmpl });
      setSearchDone(true);
    } catch { setSearchDone(true); }
    finally { setSearching(false); }
  }

  async function startFromSearch() {
    if (!searchResult) return;
    setStartingId("search");
    try {
      if (searchResult.template) {
        const res = await fetch(apiUrl("/api/inspect/sessions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: searchResult.template.id,
            componentId: searchResult.component.id,
            workOrderRef: looksLikeWorkOrder(searchQuery.trim()) ? searchQuery.trim() : null,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const result = await res.json();
        router.push(`/jobs/${result.data.sessionId}`);
      } else {
        const res = await fetch(apiUrl("/api/sessions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: `Capture for ${searchResult.component.partNumber}`,
            workOrderRef: looksLikeWorkOrder(searchQuery.trim()) ? searchQuery.trim() : null,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const session = await res.json();
        router.push(`/jobs/${session.id}`);
      }
    } catch { setStartingId(null); }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function mechanicName(user: JobSession["user"]): string {
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.name || "Unknown";
  }

  function displayStatus(status: string): JobDisplayStatus {
    return STATUS_GROUP[status] || "In Progress";
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}
        >
          Jobs
        </h1>
        <p className="text-sm mt-2" style={{ color: "rgb(100, 100, 100)" }}>
          Your work orders and inspections — all in one place.
        </p>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            placeholder="Look up by WO#, serial, or part number"
            className="max-w-md"
          />
          <Button
            onClick={() => void handleSearch()}
            disabled={searching || !searchQuery.trim()}
            variant="outline"
            className="gap-1.5 shrink-0"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </div>

        {/* Search results (inline) */}
        {searchDone && (
          <div className="mt-3 max-w-md">
            {searchResult ? (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5">
                  <p className="text-sm font-semibold text-emerald-800">{searchResult.component.description}</p>
                  <p className="text-xs text-emerald-600 mt-0.5 font-mono">
                    P/N: {searchResult.component.partNumber}
                    {searchResult.component.serialNumber && ` · S/N: ${searchResult.component.serialNumber}`}
                  </p>
                </div>
                {searchResult.template && (
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{searchResult.template.title} — {searchResult.template.itemCount} items</span>
                  </div>
                )}
                <Button
                  onClick={() => void startFromSearch()}
                  disabled={startingId === "search"}
                  className="w-full gap-2"
                  style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}
                  size="sm"
                >
                  {startingId === "search" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {searchResult.template ? "Start Guided Inspection" : "Start Freeform Capture"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No component found for &ldquo;{searchQuery}&rdquo;</p>
            )}
          </div>
        )}
      </div>

      {/* ── Active Jobs (resume) ─────────────────────────────────── */}
      {!loading && jobs.filter((j) => displayStatus(j.status) === "In Progress").length > 0 && (
        <div className="mb-6">
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-3"
            style={{ color: "rgb(140, 140, 140)" }}
          >
            Resume
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs
              .filter((j) => displayStatus(j.status) === "In Progress")
              .map((job) => (
                <div
                  key={job.id}
                  className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 text-left transition-all hover:border-blue-400 hover:shadow-sm cursor-pointer"
                  onClick={() => router.push(`/jobs/${job.id}`)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                      In Progress
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        {job.sessionType === "inspection" ? "Guided" : "Freeform"}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => setDiscardJobId(job.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Discard
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mt-2">
                    {job.component?.description || job.workOrderRef || "Untitled Job"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    {job.component?.partNumber && `P/N: ${job.component.partNumber}`}
                    {job.workOrderRef && !job.component?.partNumber && job.workOrderRef}
                    {!job.component?.partNumber && !job.workOrderRef && `Started ${formatDate(job.startedAt)}`}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Start New Inspection (template cards) ──────────────────── */}
      <div className="mb-8">
        <h2
          className="text-sm font-semibold uppercase tracking-wider mb-3"
          style={{ color: "rgb(140, 140, 140)" }}
        >
          Start New Inspection
        </h2>
        {loadingTemplates ? (
          <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading manuals...
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No manuals uploaded yet.</p>
            <p className="text-xs text-slate-400 mt-1">Upload a CMM in the Library tab to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* CMM template cards */}
            {templates.map((t) => {
              const isReady = t.status === "active" || t.status === "review_ready";
              const statusInfo = TEMPLATE_STATUS[t.status] || { label: t.status, color: "bg-slate-100 text-slate-500" };
              const isStarting = startingId === t.id;
              const ageLevel = getCmmAgeWarning(t.createdAt);

              return (
                <div
                  key={t.id}
                  className={`rounded-lg border p-4 flex flex-col justify-between ${
                    isReady ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-blue-500 shrink-0" />
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{t.title}</p>
                      </div>
                      <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-0.5">
                      {t.partNumbersCovered.length > 0 && (
                        <p className="font-mono">{t.partNumbersCovered.join(", ")}</p>
                      )}
                      {isReady && t.totalItems > 0 && (
                        <p>{t.totalItems} items &middot; {t._count.sections} sections</p>
                      )}
                      {/* CMM age: uploaded date + staleness warning */}
                      <p className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Uploaded {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    {/* Age warning badges */}
                    {ageLevel === "warning" && (
                      <div className="mt-2 flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[11px] font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        CMM may be stale (30+ days)
                      </div>
                    )}
                    {ageLevel === "critical" && (
                      <div className="mt-2 flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 text-[11px] font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        CMM likely stale (90+ days)
                      </div>
                    )}
                  </div>

                  {isReady && (
                    <Button
                      onClick={() => void startFromTemplate(t.id)}
                      disabled={!!startingId}
                      className="mt-3 w-full gap-2"
                      size="sm"
                      style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}
                    >
                      {isStarting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Start
                    </Button>
                  )}
                </div>
              );
            })}

            {/* Freeform capture card */}
            <div className="rounded-lg border border-dashed border-slate-200 p-4 flex flex-col justify-between bg-white">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-600">Freeform Capture</p>
                </div>
                <p className="text-xs text-slate-400">Just start recording — no manual needed</p>
              </div>
              <Button
                onClick={() => void startFreeform()}
                disabled={!!startingId}
                variant="outline"
                className="mt-3 w-full gap-2"
                size="sm"
              >
                {startingId === "freeform" && <Loader2 className="h-4 w-4 animate-spin" />}
                Start
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Your Jobs (existing job list) ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "rgb(140, 140, 140)" }}
          >
            Your Jobs
          </h2>
          <Button onClick={() => void fetchJobs()} variant="ghost" size="sm" className="gap-1.5 text-xs text-slate-400">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : error ? (
              <div className="rounded-2xl border px-6 py-10 text-center" style={{ borderColor: "rgb(253, 230, 138)", backgroundColor: "rgba(255, 251, 235, 0.9)" }}>
                <AlertTriangle className="h-8 w-8 mx-auto mb-3" style={{ color: "rgb(217, 119, 6)" }} />
                <p className="text-sm" style={{ color: "rgb(146, 64, 14)" }}>{error}</p>
                <Button onClick={() => void fetchJobs()} className="gap-2 mt-4" variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4" /> Retry
                </Button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12" style={{ color: "rgb(140, 140, 140)" }}>
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No jobs yet. Pick a manual above to start.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase tracking-wider" style={{ color: "rgb(140, 140, 140)" }}>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Work Order</th>
                      <th className="pb-3 pr-4">Component</th>
                      <th className="pb-3 pr-4">Mechanic</th>
                      <th className="pb-3 pr-4">Started</th>
                      <th className="pb-3">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const status = displayStatus(job.status);
                      return (
                        <tr
                          key={job.id}
                          className="border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50"
                          onClick={() => router.push(`/jobs/${job.id}`)}
                        >
                          <td className="py-3.5 pr-4">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                              {status}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4">
                            {job.workOrderRef ? (
                              <span className="font-mono text-xs font-medium text-slate-700">{job.workOrderRef}</span>
                            ) : (
                              <span className="text-slate-300">&mdash;</span>
                            )}
                          </td>
                          <td className="py-3.5 pr-4">
                            {job.component ? (
                              <div>
                                <p className="font-mono text-xs font-medium text-slate-700">{job.component.partNumber}</p>
                                {job.component.serialNumber && (
                                  <p className="font-mono text-xs text-slate-400">{job.component.serialNumber}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300">&mdash;</span>
                            )}
                          </td>
                          <td className="py-3.5 pr-4 text-slate-600">{mechanicName(job.user)}</td>
                          <td className="py-3.5 pr-4 text-slate-500 text-xs">{formatDate(job.startedAt)}</td>
                          <td className="py-3.5">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                              {job.sessionType === "inspection" ? "Guided" : "Freeform"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Discard job confirmation dialog ────────────────────────── */}
      <AlertDialog open={!!discardJobId} onOpenChange={(open) => { if (!open) setDiscardJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the job and all captured evidence. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardJob}
              disabled={discarding}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {discarding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Check if input looks like a work order (contains both letters and numbers)
function looksLikeWorkOrder(input: string): boolean {
  return /[a-zA-Z]/.test(input) && /\d/.test(input);
}
