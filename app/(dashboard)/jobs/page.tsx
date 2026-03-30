"use client";

// Jobs page — unified launcher for starting and resuming work.
// Search-first design: type a part number, doc name, or WO# and cards filter instantly.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { apiUrl } from "@/lib/api-url";
import {
  ClipboardCheck,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Search,
  Camera,
  FileText,
  Upload,
  MoreVertical,
  Trash2,
} from "lucide-react";
import PdfThumbnail from "@/components/pdf-thumbnail";
import UploadModal from "../library/upload-modal";

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

// Friendly labels for template extraction status
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
  sourceFileName: string;
  sourceFileUrl: string;
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
  const [startingId, setStartingId] = useState<string | null>(null);

  // Search — filters cards in real-time (no server call)
  const [searchQuery, setSearchQuery] = useState("");

  // Pre-start dialog
  const [showPreStart, setShowPreStart] = useState(false);
  const [preStartTemplate, setPreStartTemplate] = useState<LibraryTemplate | null>(null);
  const [preStartMode, setPreStartMode] = useState<"guided" | "freeform">("guided");
  const [preStartWO, setPreStartWO] = useState("");

  // Upload modal (reused from Library page)
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Discard job confirmation
  const [discardJobId, setDiscardJobId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────

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

  // ─── Client-side search: filter cards as user types ─────────────────

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return templates;

    return templates.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.sourceFileName && t.sourceFileName.toLowerCase().includes(q)) ||
      t.partNumbersCovered.some((pn) => pn.toLowerCase().includes(q))
    );
  }, [templates, searchQuery]);

  const hasSearchQuery = searchQuery.trim().length > 0;
  const noResults = hasSearchQuery && filteredTemplates.length === 0;

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

  // ─── Pre-start dialog ──────────────────────────────────────────────

  function openPreStart(template: LibraryTemplate | null, mode: "guided" | "freeform") {
    setPreStartTemplate(template);
    setPreStartMode(mode);
    setPreStartWO("");
    setShowPreStart(true);
  }

  function handlePreStartConfirm() {
    setShowPreStart(false);
    const wo = preStartWO.trim() || undefined;
    if (preStartMode === "guided" && preStartTemplate) {
      void startFromTemplate(preStartTemplate.id, wo);
    } else {
      void startFreeform(wo);
    }
  }

  function handleSkipStart() {
    setShowPreStart(false);
    if (preStartMode === "guided" && preStartTemplate) {
      void startFromTemplate(preStartTemplate.id);
    } else {
      void startFreeform();
    }
  }

  // ─── Start guided inspection from a template ───────────────────────

  async function startFromTemplate(templateId: string, workOrderRef?: string) {
    setStartingId(templateId);
    try {
      const res = await fetch(apiUrl("/api/inspect/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, workOrderRef: workOrderRef || null }),
      });
      if (!res.ok) throw new Error("Failed to create job");
      const result = await res.json();
      router.push(`/jobs/${result.data.sessionId}`);
    } catch (err) {
      console.error(err);
      setStartingId(null);
    }
  }

  // ─── Start freeform capture (no documentation) ─────────────────────

  async function startFreeform(workOrderRef?: string) {
    setStartingId("freeform");
    try {
      const res = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Web capture session",
          workOrderRef: workOrderRef || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const session = await res.json();
      router.push(`/jobs/${session.id}`);
    } catch (err) {
      console.error(err);
      setStartingId(null);
    }
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

  function extractDocRef(t: LibraryTemplate): string | null {
    const combined = `${t.title} ${t.sourceFileName || ""}`;
    const match = combined.match(/\d{2}-\d{2}-\d{2}/);
    return match ? match[0] : null;
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

      {/* ── Search bar (real-time filter) ─────────────────────────── */}
      <div className="mb-6">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by part number, WO#, or document name..."
            className="pl-10"
          />
        </div>
        {hasSearchQuery && !noResults && (
          <p className="text-xs text-slate-400 mt-2">
            Showing {filteredTemplates.length} of {templates.length} documents
          </p>
        )}
      </div>

      {/* ── Active Jobs (resume) ─────────────────────────────────── */}
      {!loading && jobs.filter((j) => displayStatus(j.status) === "In Progress").length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "rgb(140, 140, 140)" }}>
            Resume
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobs.filter((j) => displayStatus(j.status) === "In Progress").map((job) => (
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
                      {job.sessionType === "inspection" ? "Documentation" : "Open capture"}
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
                        <DropdownMenuItem onClick={() => setDiscardJobId(job.id)} className="text-red-600 focus:text-red-600">
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

      {/* ── Start New Job (template cards, filtered by search) ────── */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "rgb(140, 140, 140)" }}>
          Start New Job
        </h2>

        {loadingTemplates ? (
          <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading documentation...
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No documentation uploaded yet.</p>
            <p className="text-xs text-slate-400 mt-1">Upload documentation in the Library tab to get started.</p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => openPreStart(null, "freeform")}>
                <Camera className="h-4 w-4" /> Start without documentation
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setShowUploadModal(true)}>
                <Upload className="h-4 w-4" /> Upload documentation
              </Button>
            </div>
          </div>
        ) : noResults ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <FileText className="h-8 w-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 mb-1">No matching documentation for &ldquo;{searchQuery}&rdquo;</p>
            <p className="text-xs text-slate-400 mb-4">You can still start a job, or upload the document you need.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => openPreStart(null, "freeform")}>
                <Camera className="h-4 w-4" /> Start without documentation
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setShowUploadModal(true)} style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}>
                <Upload className="h-4 w-4" /> Upload documentation
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTemplates.map((t) => {
              const isReady = t.status === "active" || t.status === "review_ready";
              const statusInfo = TEMPLATE_STATUS[t.status] || { label: t.status, color: "bg-slate-100 text-slate-500" };
              const isStarting = startingId === t.id;
              const docRef = extractDocRef(t);

              return (
                <div key={t.id} className={`rounded-lg border overflow-hidden flex flex-col ${isReady ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                  {t.sourceFileUrl ? (
                    <PdfThumbnail url={t.sourceFileUrl} alt={`Preview of ${t.title}`} className="h-40 border-b border-slate-100" />
                  ) : (
                    <div className="h-40 bg-slate-100 border-b border-slate-100 flex items-center justify-center">
                      <FileText className="h-10 w-10 text-slate-300" />
                    </div>
                  )}
                  <div className="p-3 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      {docRef ? (
                        <span className="text-base font-bold text-slate-800 font-mono">{docRef}</span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-800 leading-tight">{t.title}</span>
                      )}
                      <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    {t.partNumbersCovered.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {t.partNumbersCovered.slice(0, 4).map((pn) => (
                          <span key={pn} className="text-[11px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{pn}</span>
                        ))}
                        {t.partNumbersCovered.length > 4 && (
                          <span className="text-[11px] text-slate-400">+{t.partNumbersCovered.length - 4} more</span>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-auto">
                      Uploaded {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    {isReady && (
                      <Button onClick={() => openPreStart(t, "guided")} disabled={!!startingId} className="mt-2 w-full gap-2" size="sm" style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}>
                        {isStarting && <Loader2 className="h-4 w-4 animate-spin" />}
                        Start Job
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border border-dashed border-slate-200 overflow-hidden flex flex-col bg-white">
              <div className="h-40 bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                <Camera className="h-10 w-10 text-slate-300" />
              </div>
              <div className="p-3 flex flex-col flex-1">
                <p className="text-sm font-semibold text-slate-600 mb-1">Start without documentation</p>
                <p className="text-[11px] text-slate-400 mb-auto">Record findings freely</p>
                <Button onClick={() => openPreStart(null, "freeform")} disabled={!!startingId} variant="outline" className="mt-2 w-full gap-2" size="sm">
                  {startingId === "freeform" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Start Job
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Your Jobs ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "rgb(140, 140, 140)" }}>Your Jobs</h2>
          <Button onClick={() => void fetchJobs()} variant="ghost" size="sm" className="gap-1.5 text-xs text-slate-400">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : error ? (
              <div className="rounded-2xl border px-6 py-10 text-center" style={{ borderColor: "rgb(253, 230, 138)", backgroundColor: "rgba(255, 251, 235, 0.9)" }}>
                <AlertTriangle className="h-8 w-8 mx-auto mb-3" style={{ color: "rgb(217, 119, 6)" }} />
                <p className="text-sm" style={{ color: "rgb(146, 64, 14)" }}>{error}</p>
                <Button onClick={() => void fetchJobs()} className="gap-2 mt-4" variant="outline" size="sm"><RefreshCw className="h-4 w-4" /> Retry</Button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12" style={{ color: "rgb(140, 140, 140)" }}>
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No jobs yet. Start one above.</p>
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
                        <tr key={job.id} className="border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50" onClick={() => router.push(`/jobs/${job.id}`)}>
                          <td className="py-3.5 pr-4"><span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>{status}</span></td>
                          <td className="py-3.5 pr-4">{job.workOrderRef ? <span className="font-mono text-xs font-medium text-slate-700">{job.workOrderRef}</span> : <span className="text-slate-300">&mdash;</span>}</td>
                          <td className="py-3.5 pr-4">{job.component ? <div><p className="font-mono text-xs font-medium text-slate-700">{job.component.partNumber}</p>{job.component.serialNumber && <p className="font-mono text-xs text-slate-400">{job.component.serialNumber}</p>}</div> : <span className="text-slate-300">&mdash;</span>}</td>
                          <td className="py-3.5 pr-4 text-slate-600">{mechanicName(job.user)}</td>
                          <td className="py-3.5 pr-4 text-slate-500 text-xs">{formatDate(job.startedAt)}</td>
                          <td className="py-3.5"><span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">{job.sessionType === "inspection" ? "From docs" : "Open capture"}</span></td>
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

      {/* ── Pre-start dialog ──────────────────────────────────────── */}
      <Dialog open={showPreStart} onOpenChange={(open) => { if (!open) setShowPreStart(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{preStartMode === "guided" && preStartTemplate ? `Start Job — ${preStartTemplate.title}` : "Start Job"}</DialogTitle>
            <DialogDescription>{preStartMode === "guided" ? "Add an optional work order number before starting." : "Start capturing without documentation."}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="wo-ref">Work Order # <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input id="wo-ref" value={preStartWO} onChange={(e) => setPreStartWO(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handlePreStartConfirm()} placeholder="e.g., WO-2024-001234" className="mt-1.5" autoFocus />
          </div>
          <DialogFooter>
            <button type="button" className="text-sm text-slate-400 hover:text-slate-600 mr-auto" onClick={handleSkipStart}>Skip, just start</button>
            <Button onClick={handlePreStartConfirm} disabled={!!startingId} style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}>
              {startingId && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Start Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Discard job confirmation ──────────────────────────────── */}
      <AlertDialog open={!!discardJobId} onOpenChange={(open) => { if (!open) setDiscardJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this job?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the job and all captured evidence. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardJob} disabled={discarding} className="bg-red-600 hover:bg-red-700 text-white">
              {discarding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Upload modal ─────────────────────────────────────────── */}
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} onUploaded={() => { setShowUploadModal(false); void fetchTemplates(); }} />
      )}
    </div>
  );
}
