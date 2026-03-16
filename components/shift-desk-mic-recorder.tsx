"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Loader2, Mic, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/api-url";

const DESK_MIC_CHUNK_MS = 6000;
const DESK_MIC_DEFAULT_DEVICE_ID = "__default__";
const DESK_MIC_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
] as const;

type DeskMicState = "idle" | "requesting" | "recording" | "stopping";

interface DeskMicDeviceOption {
  deviceId: string;
  label: string;
}

export interface ShiftDeskMicRecorderHandle {
  isRecording: () => boolean;
  stopAndFlush: () => Promise<void>;
}

interface ShiftDeskMicRecorderProps {
  shiftId: string;
  enabled: boolean;
  onUnauthorized: (response: Response) => boolean;
  onStopComplete?: () => void | Promise<void>;
}

function getSupportedDeskMicMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";

  return (
    DESK_MIC_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || ""
  );
}

function getDeskMicFileExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}

function formatUploadTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const ShiftDeskMicRecorder = forwardRef<
  ShiftDeskMicRecorderHandle,
  ShiftDeskMicRecorderProps
>(function ShiftDeskMicRecorder(
  { shiftId, enabled, onUnauthorized, onStopComplete },
  ref
) {
  const [devices, setDevices] = useState<DeskMicDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(DESK_MIC_DEFAULT_DEVICE_ID);
  const [state, setState] = useState<DeskMicState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [lastUploadedAt, setLastUploadedAt] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const currentChunkStartedAtRef = useRef<number | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const stopPromiseResolveRef = useRef<(() => void) | null>(null);
  const stopInFlightRef = useRef<Promise<void> | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const cleanupMedia = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    currentChunkStartedAtRef.current = null;
    stopPromiseRef.current = null;
    stopPromiseResolveRef.current = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }

    try {
      const audioInputs = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId || `${index}`,
          label: device.label || `Microphone ${index + 1}`,
        }));

      setDevices(audioInputs);
      if (
        selectedDeviceId !== DESK_MIC_DEFAULT_DEVICE_ID &&
        audioInputs.every((device) => device.deviceId !== selectedDeviceId)
      ) {
        setSelectedDeviceId(DESK_MIC_DEFAULT_DEVICE_ID);
      }
    } catch (deviceError) {
      console.error("Desk mic device enumeration failed:", deviceError);
    }
  }, [selectedDeviceId]);

  const queueChunkUpload = useCallback(
    (blob: Blob, chunkStartedAtMs: number) => {
      if (!blob.size) return;

      setPendingChunks((current) => current + 1);

      uploadChainRef.current = uploadChainRef.current
        .then(async () => {
          const mimeType = blob.type || getSupportedDeskMicMimeType() || "audio/webm";
          const extension = getDeskMicFileExtension(mimeType);
          const chunkTimestamp = new Date(chunkStartedAtMs).toISOString();
          const formData = new FormData();

          formData.append(
            "audio",
            blob,
            `desk-mic-${chunkTimestamp.replace(/[:.]/g, "-")}.${extension}`
          );
          formData.append("chunkTimestamp", chunkTimestamp);

          const response = await fetch(apiUrl(`/api/shifts/${shiftId}/audio`), {
            method: "POST",
            body: formData,
          });

          if (onUnauthorized(response)) return;

          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success) {
            throw new Error(payload?.error || "Failed to upload desk mic chunk");
          }

          setUploadedChunks((current) => current + 1);
          setLastUploadedAt(new Date().toISOString());
          if (lastErrorRef.current) {
            lastErrorRef.current = null;
            setError(null);
          }
        })
        .catch((uploadError) => {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : "AeroVision could not upload the latest desk-mic chunk.";

          lastErrorRef.current = message;
          setError(message);
        })
        .finally(() => {
          setPendingChunks((current) => Math.max(0, current - 1));
        });
    },
    [onUnauthorized, shiftId]
  );

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

    const stopPromise =
      stopPromiseRef.current ||
      new Promise<void>((resolve) => {
        stopPromiseResolveRef.current = resolve;
      });

    stopPromiseRef.current = stopPromise;
    stopInFlightRef.current = (async () => {
      recorder.stop();
      await stopPromise;
      await uploadChainRef.current;
      cleanupMedia();
      setState("idle");
      await onStopComplete?.();
    })()
      .catch((stopError) => {
        const message =
          stopError instanceof Error
            ? stopError.message
            : "AeroVision could not finish the desk-mic recording cleanly.";
        setError(message);
      })
      .finally(() => {
        stopInFlightRef.current = null;
      });

    await stopInFlightRef.current;
  }, [cleanupMedia, onStopComplete]);

  const startRecording = useCallback(async () => {
    if (!enabled || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    setState("requesting");
    setError(null);
    setUploadedChunks(0);
    setPendingChunks(0);
    setLastUploadedAt(null);
    lastErrorRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          deviceId:
            selectedDeviceId === DESK_MIC_DEFAULT_DEVICE_ID
              ? undefined
              : { exact: selectedDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;
      await refreshDevices();

      const supportedMimeType = getSupportedDeskMicMimeType();
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;

        const chunkStartedAtMs = currentChunkStartedAtRef.current ?? Date.now();
        currentChunkStartedAtRef.current = Date.now();
        queueChunkUpload(event.data, chunkStartedAtMs);
      };

      recorder.onerror = () => {
        setError("The browser stopped capturing the desk mic unexpectedly.");
      };

      recorder.onstop = () => {
        stopPromiseResolveRef.current?.();
        stopPromiseResolveRef.current = null;
      };

      stopPromiseRef.current = new Promise<void>((resolve) => {
        stopPromiseResolveRef.current = resolve;
      });

      currentChunkStartedAtRef.current = Date.now();
      mediaRecorderRef.current = recorder;
      recorder.start(DESK_MIC_CHUNK_MS);
      setState("recording");
    } catch (startError) {
      cleanupMedia();
      setState("idle");

      const message =
        startError instanceof Error ? startError.message : "Failed to start the desk mic.";
      if (/permission|notallowed/i.test(message)) {
        setError(
          "Microphone access was denied. Allow browser access to the Logitech mic and try again."
        );
      } else {
        setError(message);
      }
    }
  }, [cleanupMedia, enabled, queueChunkUpload, refreshDevices, selectedDeviceId]);

  useImperativeHandle(
    ref,
    () => ({
      isRecording: () => state === "recording" || state === "requesting" || state === "stopping",
      stopAndFlush,
    }),
    [state, stopAndFlush]
  );

  useEffect(() => {
    void refreshDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return;
    }

    mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    if (!enabled && mediaRecorderRef.current?.state === "recording") {
      void stopAndFlush();
    }
  }, [enabled, stopAndFlush]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const isRecording = state === "recording" || state === "stopping";
  const isBusy = state === "requesting" || state === "stopping";
  const browserSupportsDeskMic =
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const lastUploadedLabel = formatUploadTimestamp(lastUploadedAt);
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Desk Mic</CardTitle>
        <p className="text-sm text-slate-500">
          Choose the Logitech Blue microphone and let AeroVision upload short note chunks into
          this shift continuously while the technician works.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!browserSupportsDeskMic ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This browser does not support live desk-mic capture. Use Chrome or Safari on the
            technician workstation.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Microphone</label>
              <Select
                value={selectedDeviceId}
                onValueChange={setSelectedDeviceId}
                disabled={isBusy || isRecording}
              >
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Choose a microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DESK_MIC_DEFAULT_DEVICE_ID}>Browser default microphone</SelectItem>
                  {devices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Mic className={`h-4 w-4 ${isRecording ? "text-green-600" : "text-slate-400"}`} />
                {isRecording
                  ? "Recording live"
                  : state === "requesting"
                    ? "Requesting microphone access"
                    : state === "stopping"
                      ? "Stopping and flushing final chunk"
                      : "Ready to record"}
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {isRecording
                  ? `Using ${selectedDevice?.label || "the selected microphone"} and uploading every ${DESK_MIC_CHUNK_MS / 1000} seconds.`
                  : "Start the desk mic when the technician is ready to dictate notes out loud."}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Uploaded {uploadedChunks} chunk{uploadedChunks === 1 ? "" : "s"}
                {pendingChunks > 0 ? ` · ${pendingChunks} still sending` : ""}
                {lastUploadedLabel ? ` · last chunk ${lastUploadedLabel}` : ""}
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {isRecording ? (
                <Button
                  variant="destructive"
                  onClick={() => void stopAndFlush()}
                  disabled={isBusy}
                >
                  {state === "stopping" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  Stop desk mic
                </Button>
              ) : (
                <Button onClick={() => void startRecording()} disabled={!enabled || isBusy}>
                  {state === "requesting" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="mr-2 h-4 w-4" />
                  )}
                  Start desk mic
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => void refreshDevices()}
                disabled={isBusy || isRecording}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh devices
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});
