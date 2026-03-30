"use client";

// Renders the first page of a PDF as an image thumbnail.
// Uses pdfjs-dist (already installed) to render client-side.

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

interface PdfThumbnailProps {
  url: string;
  alt?: string;
  className?: string;
}

export default function PdfThumbnail({ url, alt = "Document preview", className = "" }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) { setError(true); return; }

    let cancelled = false;

    async function render() {
      try {
        // Dynamic import to avoid SSR issues — pdfjs-dist is browser-only
        const pdfjsLib = await import("pdfjs-dist");

        // Set worker source to bundled worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const doc = await pdfjsLib.getDocument({ url, disableAutoFetch: true, disableStream: false }).promise;
        if (cancelled) return;

        const page = await doc.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at a width that looks sharp on retina but stays small
        const targetWidth = 400;
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // pdfjs-dist v5 requires `canvas` in RenderParameters
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas } as any).promise;
        if (!cancelled) setLoaded(true);
      } catch (err) {
        console.error("PDF thumbnail error:", err);
        if (!cancelled) setError(true);
      }
    }

    void render();
    return () => { cancelled = true; };
  }, [url]);

  // Error state — show a placeholder icon
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 ${className}`}>
        <FileText className="h-10 w-10 text-slate-300" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      {/* Loading skeleton */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-slate-200" />
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{ display: "block" }}
        aria-label={alt}
      />
    </div>
  );
}
