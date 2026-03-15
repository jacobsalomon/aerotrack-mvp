// Signature capture pad for electronically signing documents.
// Renders a canvas where users draw their signature with mouse or touch.
// Returns the signature as a base64 PNG string.

"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  // Called when the user confirms their signature
  onSign: (signatureImage: string) => void;
  // Called when the user cancels
  onCancel: () => void;
  // Whether the sign action is in progress
  loading?: boolean;
  // Width/height of the canvas
  width?: number;
  height?: number;
}

export default function SignaturePad({
  onSign,
  onCancel,
  loading = false,
  width = 500,
  height = 200,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Set up the canvas context on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Drawing style
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [width, height]);

  // Get coordinates from mouse or touch event
  const getCoords = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
      setHasDrawn(true);
    },
    [getCoords]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getCoords]
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Clear the canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);
    setHasDrawn(false);
  }, [width, height]);

  // Export as base64 PNG and call onSign
  const handleSign = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSign(dataUrl);
  }, [hasDrawn, onSign]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Draw your signature below to electronically sign this document.
      </p>

      {/* Canvas area with signature line */}
      <div className="relative border-2 border-slate-300 rounded-lg bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {/* Signature line */}
        <div
          className="absolute bottom-8 left-8 right-8 border-b border-slate-300"
          style={{ pointerEvents: "none" }}
        />
        <p
          className="absolute bottom-2 left-8 text-[10px] text-slate-400"
          style={{ pointerEvents: "none" }}
        >
          Sign above
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="outline" onClick={clearCanvas} disabled={loading}>
          Clear
        </Button>
        <Button
          onClick={handleSign}
          disabled={!hasDrawn || loading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? "Signing..." : "Sign Document"}
        </Button>
      </div>
    </div>
  );
}
