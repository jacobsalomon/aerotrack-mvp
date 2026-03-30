"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

// PDF.js is loaded dynamically to avoid SSR issues and reduce bundle impact
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import("pdfjs-dist");
  // Set the worker source to the bundled worker
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  pdfjsLib = lib;
  return lib;
}

interface PdfViewerProps {
  fileUrl: string;
  pageIndex: number; // 0-based page index to render
}

export default function PdfViewer({ fileUrl, pageIndex }: PdfViewerProps) {
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
      const page = await pdf.getPage(pageIndex + 1); // pdf.js uses 1-based

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      // Fit page width to container instead of using a fixed scale
      const dpr = window.devicePixelRatio || 1;
      const defaultViewport = page.getViewport({ scale: 1 });
      const containerWidth = container.clientWidth;
      const fitScale = containerWidth / defaultViewport.width;
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
    // Reset pan/zoom when page changes
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [renderPage]);

  // Scroll zoom
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.5, Math.min(4, s + delta)));
  }

  // Pan via drag
  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    dragStart.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setTranslate({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }

  function handleMouseUp() {
    setDragging(false);
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-500">
        {error}
      </div>
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

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 rounded-lg px-2 py-1 text-xs text-slate-500 shadow-sm">
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
          onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }}
          className="px-1.5 py-0.5 hover:text-slate-900 border-l border-slate-200 ml-1 pl-1.5"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
