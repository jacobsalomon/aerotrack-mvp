"use client";

// PDF viewer with two modes:
// - "single" (default): renders one page at a time via pageIndex prop (used in library review)
// - "scroll": renders all pages in a scrollable container with lazy loading (used in inspect workspace)

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

// PDF.js loaded dynamically to avoid SSR issues
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  pdfjsLib = lib;
  return lib;
}

interface PdfViewerProps {
  fileUrl: string;
  // Single-page mode props
  pageIndex?: number;       // 0-based page index (single mode)
  // Scroll mode props
  mode?: "single" | "scroll";
  scrollToPage?: number;    // 0-based page to scroll to (scroll mode)
}

// ── Single-page mode component (original behavior) ──
function SinglePageViewer({ fileUrl, pageIndex = 0 }: { fileUrl: string; pageIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const renderPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument(fileUrl).promise;
      const page = await pdf.getPage(pageIndex + 1);
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const defaultViewport = page.getViewport({ scale: 1 });
      const fitScale = container.clientWidth / defaultViewport.width;
      const viewport = page.getViewport({ scale: fitScale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
      setLoading(false);
    } catch (err) {
      console.error("[PdfViewer] Render error:", err);
      setError("Failed to render PDF page");
      setLoading(false);
    }
  }, [fileUrl, pageIndex]);

  useEffect(() => {
    renderPage();
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [renderPage]);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.5, Math.min(4, s + delta)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    dragStart.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setTranslate({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }

  function handleMouseUp() { setDragging(false); }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-500">{error}</div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-100 select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-100/80">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}
      <div
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "top left",
          transition: dragging ? "none" : "transform 0.1s ease-out",
        }}
      >
        <canvas ref={canvasRef} />
      </div>

      <ZoomControls scale={scale} setScale={setScale} onReset={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }} />
    </div>
  );
}

// ── Scroll mode: all pages stacked vertically, lazy-rendered ──
function ScrollViewer({ fileUrl, scrollToPage }: { fileUrl: string; scrollToPage?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const pdfDocRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load the PDF document once
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument(fileUrl).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[PdfViewer scroll] Load error:", err);
        setError("Failed to load PDF");
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Scroll to a specific page when scrollToPage changes
  useEffect(() => {
    if (scrollToPage == null || scrollToPage < 0) return;
    const pageEl = pageRefsMap.current.get(scrollToPage);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scrollToPage]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-500">{error}</div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-100">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top center", width: `${100 / scale}%` }}>
          {Array.from({ length: totalPages }, (_, i) => (
            <LazyPage
              key={i}
              pageIndex={i}
              pdfDoc={pdfDocRef.current!}
              containerRef={containerRef}
              onRef={(el) => {
                if (el) pageRefsMap.current.set(i, el);
                else pageRefsMap.current.delete(i);
              }}
            />
          ))}
        </div>
      </div>

      <ZoomControls scale={scale} setScale={setScale} onReset={() => setScale(1)} />
    </div>
  );
}

// ── Lazily rendered single page (renders when visible via IntersectionObserver) ──
function LazyPage({
  pageIndex,
  pdfDoc,
  containerRef,
  onRef,
}: {
  pageIndex: number;
  pdfDoc: import("pdfjs-dist").PDFDocumentProxy;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRef: (el: HTMLDivElement | null) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const renderingRef = useRef(false);

  // Register ref for scrollToPage
  useEffect(() => {
    onRef(divRef.current);
    return () => onRef(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Observe visibility — render when page enters the viewport (with generous margin)
  useEffect(() => {
    const div = divRef.current;
    if (!div) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !rendered && !renderingRef.current) {
          renderingRef.current = true;
          renderPageToCanvas();
        }
      },
      { root: containerRef.current, rootMargin: "200px 0px" }
    );
    observer.observe(div);
    return () => observer.disconnect();
  }, [rendered]); // eslint-disable-line react-hooks/exhaustive-deps

  async function renderPageToCanvas() {
    try {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const canvas = canvasRef.current;
      const div = divRef.current;
      if (!canvas || !div) return;

      const dpr = window.devicePixelRatio || 1;
      const defaultViewport = page.getViewport({ scale: 1 });
      const containerWidth = div.clientWidth || 600;
      const fitScale = containerWidth / defaultViewport.width;
      const viewport = page.getViewport({ scale: fitScale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      // Set the placeholder div height to match the rendered page
      div.style.minHeight = `${viewport.height / dpr}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
      setRendered(true);
    } catch (err) {
      console.error(`[PdfViewer] Failed to render page ${pageIndex + 1}:`, err);
    }
  }

  return (
    <div
      ref={divRef}
      className="relative border-b border-slate-200"
      style={{ minHeight: rendered ? undefined : "800px" }}
    >
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-slate-400 text-xs">Page {pageIndex + 1}</span>
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

// ── Shared zoom controls ──
function ZoomControls({
  scale,
  setScale,
  onReset,
}: {
  scale: number;
  setScale: (fn: (s: number) => number) => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 rounded-lg px-2 py-1 text-xs text-slate-500 shadow-sm z-10">
      <button
        onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
        className="px-1.5 py-0.5 hover:text-slate-900"
      >
        −
      </button>
      <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
      <button
        onClick={() => setScale((s) => Math.min(4, s + 0.25))}
        className="px-1.5 py-0.5 hover:text-slate-900"
      >
        +
      </button>
      <button
        onClick={onReset}
        className="px-1.5 py-0.5 hover:text-slate-900 border-l border-slate-200 ml-1 pl-1.5"
      >
        Reset
      </button>
    </div>
  );
}

// ── Main export: picks mode based on props ──
export default function PdfViewer({ fileUrl, pageIndex = 0, mode = "single", scrollToPage }: PdfViewerProps) {
  if (mode === "scroll") {
    return <ScrollViewer fileUrl={fileUrl} scrollToPage={scrollToPage} />;
  }
  return <SinglePageViewer fileUrl={fileUrl} pageIndex={pageIndex} />;
}
