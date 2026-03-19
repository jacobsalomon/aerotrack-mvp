"use client";

// Session Desk Mic Recorder — records audio from the computer mic during a capture session.
// Records in short chunks, uploads each chunk to /api/sessions/[id]/audio for transcription.
// Automatically stops if the user navigates away or closes the tab.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Loader2, Mic, MicOff, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/api-url";

// How often to stop/restart the recorder and upload a chunk (milliseconds).
// We stop and restart (instead of using MediaRecorder's timeslice param) because
// timeslice produces chunks without WebM headers — only the first chunk is a valid
// standalone file. Transcription APIs reject headerless chunks as "corrupted audio".
const CHUNK_INTERVAL_MS = 15_000;
const DEFAULT_DEVICE_ID = "__default__";

// Browser support varies — Chrome uses webm/opus, Safari uses mp4/aac
const SUPPORTED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
] as const;

type RecorderState = "idle" | "requesting" | "recording" | "muted" | "stopping";

interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface SessionDeskMicRecorderHandle {
  isRecording: () => boolean;
  stopAndFlush: () => Promise<void>;
}

interface SessionDeskMicRecorderProps {
  sessionId: string;
  /** Auto-start recording on mount (skips the "Start" button step) */
  autoStart?: boolean;
  /** Called when recording starts or stops so parent can track mic state */
  onRecordingStateChange?: (isRecording: boolean) => void;
  /** Called with the transcript text after each chunk is transcribed */
  onTranscript?: (text: string) => void;
  onChunkUploaded?: () => void;
  onError?: (message: string) => void;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    SUPPORTED_MIME_TYPES.find((mt) => MediaRecorder.isTypeSupported(mt)) || ""
  );
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}

export const SessionDeskMicRecorder = forwardRef<
  SessionDeskMicRecorderHandle,
  SessionDeskMicRecorderProps
>(function SessionDeskMicRecorder({ sessionId, autoStart, onRecordingStateChange, onTranscript, onChunkUploaded, onError }, ref) {
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const currentChunkStartRef = useRef<number | null>(null);
  const stopInFlightRef = useRef<Promise<void> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFinalStopRef = useRef(false);
  const mimeTypeRef = useRef<string>("");

  // Elapsed time timer
  useEffect(() => {
    if (state === "recording" || state === "muted") {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedSeconds(
          Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000)
        );
      }, 1000);
    } else if (state === "idle") {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const cleanupMedia = useCallback(() => {
    if (chunkCycleRef.current) {
      clearInterval(chunkCycleRef.current);
      chunkCycleRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    currentChunkStartRef.current = null;
    isFinalStopRef.current = false;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId || `${i}`,
          label: d.label || `Microphone ${i + 1}`,
        }));
      setDevices(inputs);
      if (
        selectedDeviceId !== DEFAULT_DEVICE_ID &&
        inputs.every((d) => d.deviceId !== selectedDeviceId)
      ) {
        setSelectedDeviceId(DEFAULT_DEVICE_ID);
      }
    } catch (err) {
      console.error("Device enumeration failed:", err);
    }
  }, [selectedDeviceId]);

  // Upload one audio chunk to the session audio endpoint
  const queueChunkUpload = useCallback(
    (blob: Blob, chunkStartMs: number) => {
      if (!blob.size || blob.size < 100) return;
      setPendingChunks((c) => c + 1);

      uploadChainRef.current = uploadChainRef.current
        .then(async () => {
          const mimeType = blob.type || getSupportedMimeType() || "audio/webm";
          const ext = getFileExtension(mimeType);
          const timestamp = new Date(chunkStartMs).toISOString();
          const formData = new FormData();

          formData.append(
            "audio",
            blob,
            `desk-mic-${timestamp.replace(/[:.]/g, "-")}.${ext}`
          );
          formData.append("chunkTimestamp", timestamp);

          const response = await fetch(apiUrl(`/api/sessions/${sessionId}/audio`), {
            method: "POST",
            body: formData,
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || `Upload failed (${response.status})`);
          }

          // Surface the transcript text so the UI can show it in real time
          const text = payload?.data?.transcription?.text;
          if (text) onTranscript?.(text);

          setUploadedChunks((c) => c + 1);
          setError(null);
          onChunkUploaded?.();
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Failed to upload audio chunk";
          setError(msg);
          onError?.(msg);
        })
        .finally(() => {
          setPendingChunks((c) => Math.max(0, c - 1));
        });
    },
    [sessionId, onTranscript, onChunkUploaded, onError]
  );

  // Stop the current recorder, collect the complete blob, upload it,
  // then restart on the same stream. Each blob gets a fresh container header.
  const cycleRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (!recorder || !stream || recorder.state === "inactive") return;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 100) {
        const chunkStart = currentChunkStartRef.current ?? Date.now();
        queueChunkUpload(event.data, chunkStart);
      }
    };

    recorder.onstop = () => {
      if (isFinalStopRef.current) return;
      currentChunkStartRef.current = Date.now();
      const mime = mimeTypeRef.current;
      const newRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      newRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 100) {
          const start = currentChunkStartRef.current ?? Date.now();
          queueChunkUpload(ev.data, start);
        }
      };
      newRecorder.onerror = () => {
        setError("Browser stopped capturing the mic unexpectedly.");
      };
      mediaRecorderRef.current = newRecorder;
      newRecorder.start();
    };

    recorder.stop();
  }, [queueChunkUpload]);

  const stopAndFlush = useCallback(async () => {
    if (stopInFlightRef.current) {
      await stopInFlightRef.current;
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupMedia();
      setState("idle");
      return;
    }

    setState("stopping");
    isFinalStopRef.current = true;

    stopInFlightRef.current = new Promise<void>((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 100) {
          const chunkStart = currentChunkStartRef.current ?? Date.now();
          queueChunkUpload(event.data, chunkStart);
        }
      };
      recorder.onstop = () => resolve();
      recorder.stop();
    })
      .then(() => uploadChainRef.current)
      .then(() => {
        cleanupMedia();
        setState("idle");
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Could not stop recording cleanly.";
        setError(msg);
        cleanupMedia();
        setState("idle");
      })
      .finally(() => {
        stopInFlightRef.current = null;
      });

    await stopInFlightRef.current;
  }, [cleanupMedia, queueChunkUpload]);

  // Mute/unmute — pauses/resumes the MediaRecorder without stopping the session
  const toggleMute = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (state === "recording" && recorder.state === "recording") {
      recorder.pause();
      setState("muted");
    } else if (state === "muted" && recorder.state === "paused") {
      recorder.resume();
      setState("recording");
    }
  }, [state]);

  const startRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;

    setState("requesting");
    setError(null);
    setUploadedChunks(0);
    setPendingChunks(0);
    isFinalStopRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          deviceId:
            selectedDeviceId === DEFAULT_DEVICE_ID
              ? undefined
              : { exact: selectedDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;
      await refreshDevices();

      const mime = getSupportedMimeType();
      mimeTypeRef.current = mime;
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 100) {
          const chunkStart = currentChunkStartRef.current ?? Date.now();
          queueChunkUpload(event.data, chunkStart);
        }
      };

      recorder.onerror = () => {
        setError("Browser stopped capturing the mic unexpectedly.");
      };

      currentChunkStartRef.current = Date.now();
      mediaRecorderRef.current = recorder;
      recorder.start(); // No timeslice — we cycle manually
      setState("recording");

      // Every CHUNK_INTERVAL_MS: stop recorder, collect complete blob, restart
      chunkCycleRef.current = setInterval(() => {
        cycleRecorder();
      }, CHUNK_INTERVAL_MS);
    } catch (err) {
      cleanupMedia();
      setState("idle");
      const msg = err instanceof Error ? err.message : "Failed to start mic.";
      if (/permission|notallowed/i.test(msg)) {
        setError("Microphone access denied. Allow browser access and try again.");
      } else {
        setError(msg);
      }
    }
  }, [cleanupMedia, cycleRecorder, queueChunkUpload, refreshDevices, selectedDeviceId]);

  // Expose handle for parent to check/stop recording
  useImperativeHandle(
    ref,
    () => ({
      isRecording: () =>
        state === "recording" || state === "muted" || state === "stopping",
      stopAndFlush,
    }),
    [state, stopAndFlush]
  );

  // Report recording state changes to parent
  useEffect(() => {
    onRecordingStateChange?.(state === "recording" || state === "muted");
  }, [state, onRecordingStateChange]);

  // Refresh device list on mount and when devices change
  useEffect(() => {
    void refreshDevices();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener("devicechange", refreshDevices);
    return () => md.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  // Auto-start recording if requested (e.g. when session just started)
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStartedRef.current && state === "idle") {
      autoStartedRef.current = true;
      void startRecording();
    }
  }, [autoStart, state, startRecording]);

  // Stop recording on unmount (user navigated away from session page)
  useEffect(() => {
    return () => {
      isFinalStopRef.current = true;
      if (
        mediaRecorderRef.current?.state &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      cleanupMedia();
    };
  }, [cleanupMedia]);

  // Save recording if the browser tab is about to close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (
        mediaRecorderRef.current?.state === "recording" ||
        mediaRecorderRef.current?.state === "paused"
      ) {
        isFinalStopRef.current = true;
        mediaRecorderRef.current.stop();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Format elapsed time as MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isActive = state === "recording" || state === "muted" || state === "stopping";
  const isBusy = state === "requesting" || state === "stopping";
  const hasMediaRecorder =
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  return (
    <div className="space-y-3">
      {!hasMediaRecorder ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "rgb(253, 224, 71)",
            backgroundColor: "rgb(254, 252, 232)",
            color: "rgb(161, 98, 7)",
          }}
        >
          This browser doesn&apos;t support mic recording. Use Chrome or Safari.
        </div>
      ) : (
        <>
          {/* Device selector */}
          {!isActive && (
            <div className="flex items-center gap-2">
              <Select
                value={selectedDeviceId}
                onValueChange={setSelectedDeviceId}
                disabled={isBusy || isActive}
              >
                <SelectTrigger className="flex-1 bg-white text-sm h-9">
                  <SelectValue placeholder="Choose microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_DEVICE_ID}>Default microphone</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshDevices()}
                disabled={isBusy}
                className="shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Recording status + controls */}
          {isActive && (
            <div
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
              style={{
                borderColor:
                  state === "muted"
                    ? "rgb(253, 186, 116)"
                    : "rgba(239, 68, 68, 0.3)",
                backgroundColor:
                  state === "muted"
                    ? "rgb(255, 247, 237)"
                    : "rgba(254, 242, 242, 0.5)",
              }}
            >
              {/* Pulsing red dot when recording, orange when muted */}
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  state === "recording" ? "animate-pulse" : ""
                }`}
                style={{
                  backgroundColor:
                    state === "muted" ? "rgb(249, 115, 22)" : "rgb(239, 68, 68)",
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "rgb(30, 30, 30)" }}>
                  {state === "muted"
                    ? "Muted"
                    : state === "stopping"
                    ? "Saving final chunk..."
                    : "Recording"}
                </p>
                <p className="text-xs" style={{ color: "rgb(100, 100, 100)" }}>
                  {formatTime(elapsedSeconds)} &middot; {uploadedChunks} chunk
                  {uploadedChunks !== 1 ? "s" : ""} uploaded
                  {pendingChunks > 0 ? ` · ${pendingChunks} sending` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  disabled={state === "stopping"}
                  title={state === "muted" ? "Unmute" : "Mute"}
                >
                  {state === "muted" ? (
                    <MicOff className="h-4 w-4" style={{ color: "rgb(249, 115, 22)" }} />
                  ) : (
                    <Mic className="h-4 w-4" style={{ color: "rgb(239, 68, 68)" }} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void stopAndFlush()}
                  disabled={state === "stopping"}
                  title="Stop recording"
                >
                  {state === "stopping" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Start button (when idle) */}
          {!isActive && (
            <Button
              onClick={() => void startRecording()}
              disabled={isBusy}
              size="sm"
              className="w-full"
              style={{ backgroundColor: "rgb(239, 68, 68)", color: "white" }}
            >
              {state === "requesting" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              Start Desk Mic
            </Button>
          )}

          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "rgba(239, 68, 68, 0.3)",
                backgroundColor: "rgb(254, 242, 242)",
                color: "rgb(185, 28, 28)",
              }}
            >
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
});
