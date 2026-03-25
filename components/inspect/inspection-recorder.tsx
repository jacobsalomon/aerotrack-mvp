"use client";

// InspectionRecorder — auto-starts audio recording when mounted.
// Renders a compact "● REC 2:34" indicator with mute button for the ProgressBar.
// Records in 30-second chunks and uploads to the existing audio pipeline.
// If mic permission is denied, shows a non-blocking warning instead.

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";

const CHUNK_INTERVAL_MS = 30_000;

const SUPPORTED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
] as const;

type RecState = "starting" | "recording" | "muted" | "denied" | "unavailable";

interface Props {
  sessionId: string;
  /** Called when a chunk is transcribed — parent can use this for measurement extraction */
  onTranscript?: (text: string) => void;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return SUPPORTED_MIME_TYPES.find((mt) => MediaRecorder.isTypeSupported(mt)) || "";
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function InspectionRecorder({ sessionId, onTranscript }: Props) {
  const [state, setState] = useState<RecState>("starting");
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const currentChunkStartRef = useRef<number>(0);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const isFinalStopRef = useRef(false);
  const mimeTypeRef = useRef("");
  const mountedRef = useRef(true);

  // Upload one audio chunk to the existing audio pipeline
  const uploadChunk = useCallback(
    (blob: Blob, chunkStartMs: number) => {
      if (!blob.size || blob.size < 100) return;
      uploadChainRef.current = uploadChainRef.current
        .then(async () => {
          const mimeType = blob.type || getSupportedMimeType() || "audio/webm";
          const ext = getFileExtension(mimeType);
          const timestamp = new Date(chunkStartMs).toISOString();
          const formData = new FormData();
          formData.append(
            "audio",
            blob,
            `inspect-mic-${timestamp.replace(/[:.]/g, "-")}.${ext}`
          );
          formData.append("chunkTimestamp", timestamp);
          const res = await fetch(apiUrl(`/api/sessions/${sessionId}/audio`), {
            method: "POST",
            body: formData,
          });
          const payload = await res.json().catch(() => null);
          if (payload?.data?.transcription?.text) {
            onTranscript?.(payload.data.transcription.text);
          }
        })
        .catch((err) => {
          console.error("[InspectionRecorder] chunk upload failed:", err);
        });
    },
    [sessionId, onTranscript]
  );

  // Stop current recorder, collect blob, restart on same stream
  const cycleRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (!recorder || !stream || recorder.state === "inactive") return;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 100) {
        uploadChunk(event.data, currentChunkStartRef.current || Date.now());
      }
    };
    recorder.onstop = () => {
      if (isFinalStopRef.current) return;
      currentChunkStartRef.current = Date.now();
      const mime = mimeTypeRef.current;
      const newRec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      newRec.ondataavailable = (ev) => {
        if (ev.data.size > 100) {
          uploadChunk(ev.data, currentChunkStartRef.current || Date.now());
        }
      };
      mediaRecorderRef.current = newRec;
      newRec.start();
    };
    recorder.stop();
  }, [uploadChunk]);

  // Cleanup all media resources
  const cleanup = useCallback(() => {
    if (chunkCycleRef.current) clearInterval(chunkCycleRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    chunkCycleRef.current = null;
    timerRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  // Auto-start recording on mount
  useEffect(() => {
    mountedRef.current = true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { autoGainControl: true, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const mime = getSupportedMimeType();
        mimeTypeRef.current = mime;
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);

        recorder.ondataavailable = (event) => {
          if (event.data.size > 100) {
            uploadChunk(event.data, currentChunkStartRef.current || Date.now());
          }
        };

        currentChunkStartRef.current = Date.now();
        startTimeRef.current = Date.now();
        mediaRecorderRef.current = recorder;
        recorder.start();
        setState("recording");

        // Elapsed time timer
        timerRef.current = setInterval(() => {
          if (mountedRef.current) {
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }
        }, 1000);

        // Chunk cycle — stop/restart every 30 seconds to get valid file headers
        chunkCycleRef.current = setInterval(() => {
          cycleRecorder();
        }, CHUNK_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        console.warn("[InspectionRecorder] mic access denied:", err);
        setState("denied");
      }
    }

    void start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      isFinalStopRef.current = true;
      const rec = mediaRecorderRef.current;
      if (rec?.state && rec.state !== "inactive") {
        rec.ondataavailable = (event) => {
          if (event.data.size > 100) {
            uploadChunk(event.data, currentChunkStartRef.current || Date.now());
          }
        };
        rec.stop();
      }
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mute/unmute
  function toggleMute() {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (state === "recording" && rec.state === "recording") {
      rec.pause();
      setState("muted");
    } else if (state === "muted" && rec.state === "paused") {
      rec.resume();
      setState("recording");
    }
  }

  // Mic denied — show non-blocking warning
  if (state === "denied") {
    return (
      <span className="text-amber-400 text-xs">
        Mic unavailable — enter values manually
      </span>
    );
  }

  // Browser doesn't support recording
  if (state === "unavailable") {
    return null;
  }

  // Starting state — waiting for permission
  if (state === "starting") {
    return (
      <span className="text-white/50 text-xs animate-pulse">
        Starting mic…
      </span>
    );
  }

  // Recording or muted — show compact REC indicator
  return (
    <div className="flex items-center gap-2">
      {/* Pulsing red dot */}
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${
          state === "recording" ? "animate-pulse bg-red-500" : "bg-amber-500"
        }`}
      />
      <span className={`text-xs font-mono ${state === "muted" ? "text-amber-400" : "text-red-400"}`}>
        {state === "muted" ? "MUTED" : "REC"} {formatTime(elapsed)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleMute}
        className="h-6 w-6 p-0"
        title={state === "muted" ? "Unmute" : "Mute"}
      >
        {state === "muted" ? (
          <MicOff className="h-3.5 w-3.5 text-amber-400" />
        ) : (
          <Mic className="h-3.5 w-3.5 text-red-400" />
        )}
      </Button>
    </div>
  );
}
