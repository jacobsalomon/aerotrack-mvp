"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  BookOpen,
  Clock,
  FileUp,
  Hash,
  Layers,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import UploadModal from "./upload-modal";

interface TemplateInfo {
  id: string;
  title: string;
  status: string;
  partNumbersCovered: string[];
  oem: string | null;
  revisionDate: string | null;
  totalPages: number;
  sectionCount: number;
  createdAt: string;
  createdBy: string;
  currentSectionIndex: number;
}

// Live progress data from the polling endpoint
interface ExtractionProgress {
  status: string;
  totalSections: number;
  completedSections: number;
  totalItems: number;
  pagesClassified: number;
  pagesToClassify: number;
  currentSection: { title: string; figureNumber: string } | null;
}

// Map template status to a badge with live progress info
function statusBadge(
  status: string,
  currentSectionIndex: number,
  sectionCount: number,
  progress?: ExtractionProgress
) {
  switch (status) {
    case "pending_extraction":
    case "extracting_index": {
      const classified = progress?.pagesClassified ?? 0;
      const total = progress?.pagesToClassify ?? 0;
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {classified > 0
            ? `Classifying pages ${classified}/${total}`
            : "Starting extraction..."}
        </Badge>
      );
    }
    case "extracting_details": {
      const completed = progress?.completedSections ?? currentSectionIndex;
      const total = progress?.totalSections ?? sectionCount;
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Extracting {completed}/{total}
        </Badge>
      );
    }
    case "review_ready":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
          Ready for Review
        </Badge>
      );
    case "active":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
          Active
        </Badge>
      );
    case "extraction_failed":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Failed
        </Badge>
      );
    case "archived":
      return (
        <Badge className="bg-slate-100 text-slate-500 border-slate-200">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// Statuses where "Retry Extraction" should be visible
const RETRYABLE_STATUSES = [
  "pending_extraction",
  "extracting_index",
  "extracting_details",
  "extraction_failed",
];

// The basePath for multi-zone fetch URLs
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function LibraryClient({
  templates: initialTemplates,
}: {
  templates: TemplateInfo[];
}) {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  // When updating an existing template, store its prefill data
  const [updatePrefill, setUpdatePrefill] = useState<{ title: string; partNumbers: string; oem?: string } | null>(null);
  const [templates, setTemplates] = useState(initialTemplates);

  // State for the delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<TemplateInfo | null>(null);

  // Keep local state in sync when server data refreshes (e.g. after upload)
  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);
  const [progress, setProgress] = useState<Record<string, ExtractionProgress>>({});

  // Check if any templates are currently being processed
  const processingTemplates = templates.filter((t) =>
    ["pending_extraction", "extracting_index", "extracting_details"].includes(t.status)
  );

  // Poll progress for templates that are being processed
  const pollProgress = useCallback(async () => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const updates: Record<string, ExtractionProgress> = {};
    let needsRefresh = false;

    for (const t of processingTemplates) {
      try {
        const res = await fetch(`${basePath}/api/library/${t.id}/progress`);
        if (!res.ok) continue;
        const data = await res.json();
        updates[t.id] = data;

        // If status changed to a terminal state, we need to refresh the page data
        if (data.status === "review_ready" || data.status === "extraction_failed") {
          needsRefresh = true;
        }
      } catch {
        // Silently skip — next poll will retry
      }
    }

    setProgress((prev) => ({ ...prev, ...updates }));

    // If any template finished, force a server refresh so the page
    // reflects the final state even if the tab was backgrounded for hours.
    if (needsRefresh) {
      router.refresh();
    }
  }, [processingTemplates, router]);

  useEffect(() => {
    if (processingTemplates.length === 0) return;

    // Poll immediately, then every 10 seconds.
    // Extraction takes minutes per section — 10s is plenty responsive
    // and avoids flooding Vercel runtime logs (which cap at 100 entries).
    pollProgress();
    const interval = setInterval(pollProgress, 10_000);
    return () => clearInterval(interval);
  }, [processingTemplates.length, pollProgress]);

  // Retry extraction — calls POST /api/library/{id}/retry
  async function handleRetry(templateId: string) {
    try {
      const res = await fetch(`${basePath}/api/library/${templateId}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Retry failed");
        return;
      }
      toast.success("Extraction restarted");
      // Update local state so the card shows processing status immediately
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, status: "pending_extraction", currentSectionIndex: 0, sectionCount: 0 }
            : t
        )
      );
    } catch {
      toast.error("Failed to retry extraction");
    }
  }

  // Delete template — calls DELETE /api/library/{id}
  async function handleDelete(templateId: string) {
    try {
      const res = await fetch(`${basePath}/api/library/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success("Template deleted");
      // Remove from local state so it disappears immediately
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleteTarget(null);
    }
  }

  // Split into active/processing and archived
  const activeTemplates = templates.filter((t) => t.status !== "archived");
  const archivedTemplates = templates.filter((t) => t.status === "archived");

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload CMM pages for the specific procedures you need — a full
            manual or just the sections for a particular flow. AI extracts
            torque specs, tool requirements, and inspection checks automatically.
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="shrink-0 ml-4">
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </div>

      {/* Template cards */}
      {activeTemplates.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-1">
              No procedures uploaded yet
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Upload CMM pages for the procedures you need — a full manual or
              just the specific sections for a job.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowUpload(true)}
            >
              <FileUp className="h-4 w-4 mr-2" />
              Upload your first document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeTemplates.map((template) => {
            const isClickable =
              template.status === "review_ready" ||
              template.status === "active";
            const isProcessing = [
              "pending_extraction",
              "extracting_index",
              "extracting_details",
            ].includes(template.status);
            const tp = progress[template.id];

            // Should we show the three-dot menu?
            const showRetry = RETRYABLE_STATUSES.includes(template.status);
            const showUpdate = template.status === "active" || template.status === "review_ready";
            const showDelete = template.status !== "active";
            const showMenu = showRetry || showDelete || showUpdate;

            const cardContent = (
              <Card
                className={
                  isClickable
                    ? "border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
                    : "border-slate-200"
                }
              >
                <CardContent className="py-5 px-5">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="shrink-0 mt-0.5 w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-indigo-600" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          {template.title}
                        </span>
                        {statusBadge(
                          template.status,
                          template.currentSectionIndex,
                          template.sectionCount,
                          tp
                        )}
                      </div>

                      {/* OEM */}
                      {template.oem && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {template.oem}
                        </p>
                      )}

                      {/* Live progress detail when processing */}
                      {isProcessing && tp?.currentSection && (
                        <p className="text-xs text-blue-600 mt-1">
                          Processing Fig. {tp.currentSection.figureNumber} — {tp.currentSection.title}
                          {tp.totalItems > 0 && (
                            <span className="text-slate-400 ml-2">
                              ({tp.totalItems} items found so far)
                            </span>
                          )}
                        </p>
                      )}

                      {/* Part numbers */}
                      {template.partNumbersCovered.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <Hash className="h-3 w-3 text-slate-400 shrink-0" />
                          {template.partNumbersCovered.map((pn) => (
                            <span
                              key={pn}
                              className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                            >
                              {pn}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {(tp?.totalSections ?? template.sectionCount) || 0} sections
                        </span>
                        <span>{template.totalPages} pages</span>
                        {template.revisionDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Rev.{" "}
                            {new Date(template.revisionDate).toLocaleDateString()}
                          </span>
                        )}
                        <span>
                          Uploaded{" "}
                          {new Date(template.createdAt).toLocaleDateString()}
                        </span>
                        <span>by {template.createdBy}</span>
                      </div>
                    </div>

                    {/* Three-dot dropdown menu */}
                    {showMenu && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="shrink-0 p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              aria-label="Template actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {showUpdate && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setUpdatePrefill({
                                    title: template.title,
                                    partNumbers: template.partNumbersCovered.join(", "),
                                    oem: template.oem || "",
                                  });
                                  setShowUpload(true);
                                }}
                              >
                                <Upload className="h-4 w-4" />
                                Update
                              </DropdownMenuItem>
                            )}
                            {showRetry && (
                              <DropdownMenuItem
                                onSelect={() => handleRetry(template.id)}
                              >
                                <RefreshCw className="h-4 w-4" />
                                Retry Extraction
                              </DropdownMenuItem>
                            )}
                            {showDelete && (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleteTarget(template)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );

            if (isClickable) {
              return (
                <Link
                  key={template.id}
                  href={`/library/${template.id}/review`}
                >
                  {cardContent}
                </Link>
              );
            }

            return <div key={template.id}>{cardContent}</div>;
          })}
        </div>
      )}

      {/* Archived section */}
      {archivedTemplates.length > 0 && (
        <details className="mt-8">
          <summary className="text-sm font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600">
            Previous Revisions ({archivedTemplates.length})
          </summary>
          <div className="grid gap-3 mt-4">
            {archivedTemplates.map((template) => (
              <Card key={template.id} className="border-slate-100 opacity-60">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-500">
                      {template.title}
                    </span>
                    {statusBadge(template.status, 0, 0)}
                    <span className="text-xs text-slate-400 ml-auto">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {/* Upload modal (also used for CMM updates with prefill) */}
      {showUpload && (
        <UploadModal
          onClose={() => { setShowUpload(false); setUpdatePrefill(null); }}
          prefill={updatePrefill || undefined}
          onUploaded={(t) => {
            // Add the new template to the top of the list immediately
            // so the user sees it with a "processing" badge right away.
            setTemplates((prev) => {
              if (prev.some((existing) => existing.id === t.id)) return prev;
              return [
                {
                  id: t.id,
                  title: t.title,
                  status: t.status,
                  partNumbersCovered: [],
                  oem: null,
                  revisionDate: null,
                  totalPages: 0,
                  sectionCount: 0,
                  createdAt: new Date().toISOString(),
                  createdBy: "",
                  currentSectionIndex: 0,
                },
                ...prev,
              ];
            });
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.title}&rdquo;
              and all extracted sections and items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
