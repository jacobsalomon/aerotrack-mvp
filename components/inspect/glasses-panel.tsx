"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  Glasses,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";

interface MentraGlassesPanelProps {
  sessionId: string;
  title?: string;
  onPaired?: () => void;
  onCaptureStopped?: () => void;
}

interface MentraGlassesStatus {
  connected: boolean;
  paired?: boolean;
  isCapturing?: boolean;
  captureStartedAt?: string | null;
  sessionId?: string | null;
  sessionLabel?: string | null;
  sessionType?: string | null;
  sessionStatus?: string | null;
  counts?: {
    videoChunks: number;
    photos: number;
    audioChunks: number;
  };
}

const TERMINAL_STATUSES = new Set([
  "capture_complete",
  "processing",
  "analysis_complete",
  "documents_generated",
  "verified",
  "submitted",
  "approved",
  "rejected",
  "failed",
  "cancelled",
  "reviewing",
]);

function formatElapsed(startedAt: string | null | undefined): string {
  if (!startedAt) return "0:00";
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function MentraGlassesPanel({
  sessionId,
  title = "Mentra Mini App",
  onPaired,
  onCaptureStopped,
}: MentraGlassesPanelProps) {
  const [status, setStatus] = useState<MentraGlassesStatus>({ connected: false });
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pairedCallbackRef = useRef(false);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(
        apiUrl(`/api/glasses?sessionId=${encodeURIComponent(sessionId)}`)
      );
      const data = await res.json();
      if (!res.ok) {
        setStatus({ connected: false });
        return;
      }
      setStatus(data);
    } catch {
      setStatus((prev) => ({ ...prev, connected: false }));
    }
  }, [sessionId]);

  useEffect(() => {
    void pollStatus();
    const interval = setInterval(() => {
      void pollStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [pollStatus]);

  useEffect(() => {
    if (status.paired) {
      setPairingCode(null);
      setExpiresAt(null);
      if (!pairedCallbackRef.current) {
        pairedCallbackRef.current = true;
        onPaired?.();
      }
    } else {
      pairedCallbackRef.current = false;
    }
  }, [onPaired, status.paired]);

  const generateCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/pairing-code`), {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate pairing code");
      }
      setPairingCode(data.data.code);
      setExpiresAt(new Date(data.data.expiresAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate pairing code");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!pairingCode || !expiresAt || status.paired) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
      if (remaining === 0) {
        void generateCode();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, generateCode, pairingCode, status.paired]);

  const copyCode = useCallback(async () => {
    if (!pairingCode) return;
    await navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [pairingCode]);

  const mutateCapture = useCallback(
    async (action: "start" | "stop") => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl("/api/glasses"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, sessionId }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Failed to ${action} capture`);
        }
        await pollStatus();
        if (action === "stop") {
          onCaptureStopped?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${action} capture`);
      } finally {
        setLoading(false);
      }
    },
    [onCaptureStopped, pollStatus, sessionId]
  );

  const sessionLocked = useMemo(() => {
    return status.sessionStatus ? TERMINAL_STATUSES.has(status.sessionStatus) : false;
  }, [status.sessionStatus]);

  const countdownLabel = `${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60)
    .toString()
    .padStart(2, "0")}`;

  return (
    <Card className="bg-zinc-900 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Glasses className="h-4 w-4 text-emerald-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">
            Status
          </p>
          <p className="mt-2 text-sm text-white/80">
            {status.isCapturing
              ? "Streaming live to this AeroVision session."
              : status.paired
                ? "Paired to this session and ready to capture."
                : "Generate a session code, then enter it in the Mentra mini app."}
          </p>
          {status.sessionLabel && (
            <p className="mt-2 text-xs text-emerald-300/80">
              Bound to {status.sessionLabel}
            </p>
          )}
        </div>

        {!status.paired && !sessionLocked && (
          <div className="space-y-3">
            {!pairingCode ? (
              <Button
                onClick={() => void generateCode()}
                disabled={loading}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Glasses className="h-4 w-4" />
                )}
                Connect Mentra Glasses
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/60">
                    Pairing Code
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-zinc-950 px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.35em] text-emerald-400">
                      {pairingCode}
                    </code>
                    <Button
                      onClick={() => void copyCode()}
                      variant="outline"
                      size="icon"
                      className="shrink-0 border-white/15 text-white/70 hover:bg-white/5"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-3 text-sm text-white/55">
                    Open the AeroVision Mentra mini app on your Mentra glasses and enter this code.
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/45">
                    <span>Expires in {countdownLabel}</span>
                    <button
                      onClick={() => void generateCode()}
                      className="inline-flex items-center gap-1 text-white/60 hover:text-white/80"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {status.paired && !status.isCapturing && !sessionLocked && (
          <Button
            onClick={() => void mutateCapture("start")}
            disabled={loading}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start Mentra Capture
          </Button>
        )}

        {status.isCapturing && (
          <div className="space-y-3">
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-red-300/65">
                    Live Capture
                  </p>
                  <p className="mt-2 text-3xl font-mono font-light text-red-300">
                    {formatElapsed(status.captureStartedAt)}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  Recording
                </span>
              </div>
              {status.counts && (
                <p className="mt-3 text-sm text-white/60">
                  {status.counts.videoChunks} video · {status.counts.photos} photos ·{" "}
                  {status.counts.audioChunks} audio
                </p>
              )}
            </div>

            <Button
              onClick={() => void mutateCapture("stop")}
              disabled={loading}
              variant="outline"
              className="w-full gap-2 border-red-500/35 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop Mentra Capture
            </Button>
          </div>
        )}

        {sessionLocked && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/80">
            This session is no longer open for new Mentra capture.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
