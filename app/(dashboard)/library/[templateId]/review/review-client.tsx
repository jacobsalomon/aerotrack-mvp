"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  Shield,
  X,
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
  oem: string | null;
  revisionDate: string | null;
  createdAt: string;
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
  const [showGuide, setShowGuide] = useState(false);

  // Show onboarding banner on first visit
  useEffect(() => {
    if (!localStorage.getItem("review-guide-dismissed")) {
      setShowGuide(true);
    }
  }, []);

  function dismissGuide() {
    setShowGuide(false);
    localStorage.setItem("review-guide-dismissed", "1");
  }

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
      oem: data.template.oem ?? null,
      revisionDate: data.template.revisionDate ?? null,
      createdAt: data.template.createdAt,
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
  const flaggedItems = template.sections.reduce(
    (sum, s) => sum + s.items.filter((i) => i.reviewReason || i.confidence < 0.7).length,
    0
  );
  const failedSections = template.sections.filter((s) => s.status === "failed").length;
  const canApprove =
    template.status !== "active" &&
    !template.sections.some((s) => s.status === "pending" || s.status === "extracting");

  // "Full Document" mode — browse the entire PDF page-by-page
  const isFullDocMode = activeSectionId === "__full__";

  // Track which page is being viewed within the active section (or full doc)
  const [viewingPageIdx, setViewingPageIdx] = useState<number | null>(null);
  const activePdfPage = isFullDocMode
    ? (viewingPageIdx ?? 0)
    : (viewingPageIdx ?? activeSection?.pageNumbers[0] ?? 0);

  // Click an item → scroll PDF to that item's source page
  // Reset to null first so clicking the same page twice still triggers a scroll
  const handleItemClick = useCallback((item: InspectionItemData) => {
    if (item.sourcePageNumber != null) {
      setViewingPageIdx(null);
      requestAnimationFrame(() => setViewingPageIdx(item.sourcePageNumber));
    }
  }, []);

  // Resizable divider between PDF and items panel
  const [rightPanelWidth, setRightPanelWidth] = useState(384); // matches w-96
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = rightPanelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging left = clientX decreases = panel gets wider
      const delta = dragStartXRef.current - e.clientX;
      setRightPanelWidth(Math.min(700, Math.max(280, dragStartWidthRef.current + delta)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [rightPanelWidth]);

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
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
              {template.oem && (
                <span className="text-slate-500 font-medium">{template.oem}</span>
              )}
              {template.partNumbersCovered.length > 0 && (
                <span className="font-mono">
                  {template.partNumbersCovered.join(", ")}
                </span>
              )}
              {template.revisionDate && (
                <span>
                  Rev. {new Date(template.revisionDate).toLocaleDateString()}
                </span>
              )}
              <span>
                Uploaded {new Date(template.createdAt).toLocaleDateString()}
              </span>
              <span className="text-slate-300">|</span>
              <span>{totalItems} items extracted</span>
              {flaggedItems > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {flaggedItems} flagged for review
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

      {/* Onboarding banner — shown once on first visit */}
      {showGuide && (
        <div className="shrink-0 flex items-center gap-3 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <Info className="h-4 w-4 shrink-0 text-blue-500" />
          <p className="flex-1">
            <span className="font-semibold">How to review:</span> Compare
            extracted specs against the PDF. Items flagged by AI are highlighted
            in amber — approve if correct, or edit to fix. Click &quot;Approve
            Template&quot; when done.
          </p>
          <button onClick={dismissGuide} className="shrink-0 p-0.5 hover:bg-blue-100 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
          {isFullDocMode ? (
            /* Full document browsing — scrollable through entire PDF */
            <div className="h-full flex flex-col">
              <div className="text-xs text-slate-400 mb-2">
                Full Document — {template.totalPages} pages
              </div>
              <div className="flex-1 rounded-lg overflow-hidden border border-slate-200">
                <PdfViewer
                  fileUrl={template.sourceFileUrl}
                  mode="scroll"
                  scrollToPage={viewingPageIdx ?? 0}
                />
              </div>
            </div>
          ) : activeSection ? (
            <div className="h-full flex flex-col">
              <div className="text-xs text-slate-400 mb-2">
                {activeSection.figureNumber.startsWith("DOC-")
                  ? activeSection.title
                  : `Fig. ${activeSection.figureNumber}`}
                {" — "}
                {activeSection.pageNumbers.length} page{activeSection.pageNumbers.length !== 1 ? "s" : ""}
                <span className="ml-2 text-slate-300">
                  (PDF pages: {activeSection.pageNumbers.map((p) => p + 1).join(", ")})
                </span>
              </div>
              <div className="flex-1 rounded-lg overflow-hidden border border-slate-200">
                <PdfViewer
                  fileUrl={template.sourceFileUrl}
                  mode="scroll"
                  scrollToPage={activePdfPage}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              Select a section to view
            </div>
          )}
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group"
        >
          <div className="w-0.5 h-8 rounded-full bg-slate-200" />
        </div>

        {/* Right: Extracted items */}
        <div
          className="shrink-0 overflow-y-auto pl-3"
          style={{ width: rightPanelWidth }}
        >
          {isFullDocMode ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <FileText className="h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">
                Viewing full document
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Select a section on the left to see its extracted items.
              </p>
            </div>
          ) : activeSection ? (
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
                onItemClick={handleItemClick}
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
