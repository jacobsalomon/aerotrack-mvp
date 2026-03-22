"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import PdfViewer from "@/components/library/pdf-viewer";
import SectionNav from "@/components/library/section-nav";
import ItemList, { type InspectionItemData } from "@/components/library/item-list";

interface SectionData {
  id: string;
  title: string;
  figureNumber: string;
  sheetInfo: string | null;
  pageNumbers: number[];
  status: string;
  itemCount: number;
  extractionConfidence: number;
  notes: string | null;
  items: InspectionItemData[];
}

interface TemplateData {
  id: string;
  title: string;
  status: string;
  sourceFileUrl: string;
  partNumbersCovered: string[];
  totalPages: number;
  sections: SectionData[];
}

export default function ReviewClient({
  template: initialTemplate,
}: {
  template: TemplateData;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    template.sections[0]?.id ?? null
  );
  const [approving, setApproving] = useState(false);
  const [reextracting, setReextracting] = useState<string | null>(null);

  const activeSection = template.sections.find((s) => s.id === activeSectionId);

  // Refresh data from server
  const refreshData = useCallback(async () => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const res = await fetch(`${basePath}/api/library/${template.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTemplate({
      id: data.template.id,
      title: data.template.title,
      status: data.template.status,
      sourceFileUrl: data.template.sourceFileUrl,
      partNumbersCovered: data.template.partNumbersCovered,
      totalPages: data.template.totalPages,
      sections: data.template.sections.map((s: SectionData & { items: InspectionItemData[] }) => ({
        id: s.id,
        title: s.title,
        figureNumber: s.figureNumber,
        sheetInfo: s.sheetInfo,
        pageNumbers: s.pageNumbers,
        status: s.status,
        itemCount: s.itemCount,
        extractionConfidence: s.extractionConfidence,
        notes: s.notes,
        items: s.items,
      })),
    });
  }, [template.id]);

  async function handleApprove() {
    if (!confirm("Approve this template? It will become active and auto-link to matching components.")) {
      return;
    }
    setApproving(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const res = await fetch(`${basePath}/api/library/${template.id}/approve`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(
        `Template approved! Linked to ${data.linkedCount} component${data.linkedCount === 1 ? "" : "s"}.`
      );
      router.push("/library");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to approve");
    }
    setApproving(false);
  }

  async function handleReextract(sectionId: string) {
    const section = template.sections.find((s) => s.id === sectionId);
    if (
      !confirm(
        `Re-extract "${section?.title}"? All items in this section will be replaced. Manual edits will be lost.`
      )
    ) {
      return;
    }
    setReextracting(sectionId);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const res = await fetch(
      `${basePath}/api/library/${template.id}/sections/${sectionId}/reextract`,
      { method: "POST" }
    );
    if (res.ok) {
      toast.success("Section re-extracted");
      await refreshData();
    } else {
      toast.error("Re-extraction failed");
    }
    setReextracting(null);
  }

  // Summary stats
  const totalItems = template.sections.reduce((sum, s) => sum + s.items.length, 0);
  const lowConfidenceItems = template.sections.reduce(
    (sum, s) => sum + s.items.filter((i) => i.confidence < 0.7).length,
    0
  );
  const failedSections = template.sections.filter((s) => s.status === "failed").length;
  const canApprove =
    template.status !== "active" &&
    !template.sections.some((s) => s.status === "pending" || s.status === "extracting");

  // Track which page is being viewed within the active section
  const [viewingPageIdx, setViewingPageIdx] = useState<number | null>(null);
  const activePdfPage = viewingPageIdx ?? activeSection?.pageNumbers[0] ?? 0;

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/library")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">
              {template.title}
            </h1>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>{totalItems} items</span>
              {lowConfidenceItems > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {lowConfidenceItems} need review
                </span>
              )}
              {failedSections > 0 && (
                <span className="text-red-500">{failedSections} failed</span>
              )}
              {template.status === "active" && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
          </div>
        </div>

        {canApprove && (
          <Button onClick={handleApprove} disabled={approving} className="shrink-0">
            {approving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Approve Template
          </Button>
        )}
      </div>

      {/* Main content — 3-column layout */}
      <div className="flex-1 flex gap-0 mt-4 min-h-0">
        {/* Left: Section nav */}
        <div className="w-52 shrink-0 overflow-y-auto pr-3 border-r border-slate-100">
          <SectionNav
            sections={template.sections}
            activeSectionId={activeSectionId}
            onSelectSection={(id) => { setActiveSectionId(id); setViewingPageIdx(null); }}
          />
        </div>

        {/* Center: PDF viewer */}
        <div className="flex-1 min-w-0 px-3">
          {activeSection ? (
            <div className="h-full flex flex-col">
              <div className="text-xs text-slate-400 mb-2">
                Fig. {activeSection.figureNumber} — Page{" "}
                {activePdfPage + 1} of {template.totalPages}
                {activeSection.pageNumbers.length > 1 && (
                  <span className="ml-2">
                    (PDF pages: {activeSection.pageNumbers.map((p) => p + 1).join(", ")})
                  </span>
                )}
              </div>
              <div className="flex-1 rounded-lg overflow-hidden border border-slate-200">
                <PdfViewer
                  fileUrl={template.sourceFileUrl}
                  pageIndex={activePdfPage}
                />
              </div>

              {/* Page navigation for multi-sheet sections */}
              {activeSection.pageNumbers.length > 1 && (
                <div className="flex items-center gap-1 mt-2 justify-center">
                  {activeSection.pageNumbers.map((pageIdx) => (
                    <Button
                      key={pageIdx}
                      variant={pageIdx === activePdfPage ? "default" : "outline"}
                      size="sm"
                      className="h-6 w-8 text-[10px]"
                      onClick={() => setViewingPageIdx(pageIdx)}
                    >
                      {pageIdx + 1}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              Select a section to view
            </div>
          )}
        </div>

        {/* Right: Extracted items */}
        <div className="w-96 shrink-0 overflow-y-auto pl-3 border-l border-slate-100">
          {activeSection ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  {activeSection.title}
                </h2>
                {activeSection.status !== "pending" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleReextract(activeSection.id)}
                    disabled={reextracting === activeSection.id}
                  >
                    {reextracting === activeSection.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Re-extract
                  </Button>
                )}
              </div>

              {activeSection.status === "failed" && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-700">
                  Extraction failed for this section. Re-extract or add items
                  manually.
                </div>
              )}

              <ItemList
                items={activeSection.items}
                templateId={template.id}
                sectionId={activeSection.id}
                onItemsChanged={refreshData}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              Select a section
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
