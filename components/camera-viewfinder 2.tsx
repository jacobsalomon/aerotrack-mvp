"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Camera, SwitchCamera, FlashlightOff, Flashlight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraViewfinderProps {
  /** Called with the captured image data when user takes a photo */
  onCapture: (data: { dataUrl: string; base64: string; mimeType: string }) => void;
  /** Called when the user closes the camera without capturing */
  onClose: () => void;
  /** Which camera to prefer: "environment" (rear) or "user" (front) */
  facingMode?: "environment" | "user";
}

export default function CameraViewfinder({
  onCapture,
  onClose,
  facingMode = "environment",
}: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsNativeZoom, setSupportsNativeZoom] = useState(false);

  // Camera state
  const [facing, setFacing] = useState(facingMode);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Pinch-to-zoom tracking
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);

  // Check for multiple cameras
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setHasMultipleCameras(videoDevices.length > 1);
    });
  }, []);

  // Start/restart camera when facing mode changes
  const startCamera = useCallback(async () => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setReady(false);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check zoom capabilities (the API uses getCapabilities which may not
      // exist in all browsers, so we guard carefully)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capabilities = (track as any).getCapabilities?.();
      if (capabilities?.zoom) {
        setSupportsNativeZoom(true);
        setMinZoom(capabilities.zoom.min);
        setMaxZoom(capabilities.zoom.max);
        setZoom(capabilities.zoom.min);
      } else {
        setSupportsNativeZoom(false);
        setMinZoom(1);
        setMaxZoom(5);
        setZoom(1);
      }

      // Check torch support
      setSupportsTorch(!!capabilities?.torch);
      setTorchOn(false);
      setReady(true);
    } catch (err) {
      console.error("Camera access failed:", err);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access and try again.");
      } else {
        setError("Could not access camera. Make sure no other app is using it.");
      }
    }
  }, [facing]);

  useEffect(() => {
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  // Apply zoom when it changes
  useEffect(() => {
    if (!trackRef.current) return;

    if (supportsNativeZoom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackRef.current as any).applyConstraints({ advanced: [{ zoom }] }).catch(() => {
        // Silently ignore — some devices report zoom support but fail to apply
      });
    }
  }, [zoom, supportsNativeZoom]);

  // Apply torch
  useEffect(() => {
    if (!trackRef.current || !supportsTorch) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trackRef.current as any).applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {});
  }, [torchOn, supportsTorch]);

  function handleZoomChange(newZoom: number) {
    setZoom(Math.min(maxZoom, Math.max(minZoom, newZoom)));
  }

  // Pinch-to-zoom handlers
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      if (pinchStartDistRef.current > 0) {
        const scale = dist / pinchStartDistRef.current;
        const newZoom = pinchStartZoomRef.current * scale;
        handleZoomChange(newZoom);
      }
    }
  }

  function handleTouchEnd() {
    pinchStartDistRef.current = 0;
  }

  // Capture photo
  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Set canvas to the actual video resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // If using CSS-based digital zoom (no native zoom), crop the center
    if (!supportsNativeZoom && zoom > 1) {
      const cropW = video.videoWidth / zoom;
      const cropH = video.videoHeight / zoom;
      const cropX = (video.videoWidth - cropW) / 2;
      const cropY = (video.videoHeight - cropH) / 2;
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0);
    }

    const mimeType = "image/jpeg";
    const dataUrl = canvas.toDataURL(mimeType, 0.92);
    const base64 = dataUrl.split(",")[1];

    // Stop the camera before calling back
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    onCapture({ dataUrl, base64, mimeType });
  }

  function switchCamera() {
    setFacing((prev) => (prev === "environment" ? "user" : "environment"));
  }

  // Compute video style for CSS-based digital zoom (when native zoom isn't available)
  const videoStyle: React.CSSProperties =
    !supportsNativeZoom && zoom > 1
      ? { transform: `scale(${zoom})`, transformOrigin: "center center" }
      : {};

  // Zoom percentage for display
  const zoomPercent = supportsNativeZoom
    ? `${zoom.toFixed(1)}x`
    : `${zoom.toFixed(1)}x`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/60">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </Button>

        <span className="text-white/80 text-sm font-medium">{zoomPercent}</span>

        <div className="flex gap-2">
          {supportsTorch && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTorchOn((v) => !v)}
              className="text-white hover:bg-white/20"
            >
              {torchOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
            </Button>
          )}
          {hasMultipleCameras && (
            <Button
              variant="ghost"
              size="icon"
              onClick={switchCamera}
              className="text-white hover:bg-white/20"
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Viewfinder */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {error ? (
          <div className="text-center px-8">
            <Camera className="h-16 w-16 text-white/30 mx-auto mb-4" />
            <p className="text-white/80 text-sm">{error}</p>
            <Button
              variant="outline"
              className="mt-4 text-white border-white/30 hover:bg-white/10"
              onClick={startCamera}
            >
              Retry
            </Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={videoStyle}
          />
        )}

        {/* Loading overlay */}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white/60 text-sm">Starting camera...</div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 bg-black/60 px-4 pb-6 pt-4 space-y-4">
        {/* Zoom slider */}
        {maxZoom > minZoom && (
          <div className="flex items-center gap-3 px-2">
            <button
              onClick={() => handleZoomChange(zoom - (maxZoom - minZoom) * 0.1)}
              className="text-white/70 hover:text-white p-1"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.1}
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="flex-1 accent-white h-1"
            />
            <button
              onClick={() => handleZoomChange(zoom + (maxZoom - minZoom) * 0.1)}
              className="text-white/70 hover:text-white p-1"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Capture button */}
        <div className="flex justify-center">
          <button
            onClick={capturePhoto}
            disabled={!ready}
            className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
          >
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>
        </div>
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
