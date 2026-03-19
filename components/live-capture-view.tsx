"use client";

// Live Capture View — shown when a session is actively capturing (status === "capturing").
// Two-panel layout: measurements on the left, live transcript on the right.
// Uses ShiftDeskMicRecorder for audio recording/transcription and MeasurementFeed
// for real-time measurement display. Both rely on the existing shift audio pipeline.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShiftDeskMicRecorder,
  type ShiftDeskMicRecorderHandle,
} from "@/components/shift-desk-mic-recorder";
import { MeasurementFeed } from "@/components/measurement-feed";
import { apiUrl } from "@/lib/api-url";
import { useSmartPoll } from "@/lib/use-smart-poll";
import {
  ArrowLeft,
  Camera,
  Clock,
  Loader2,
  Mic,
  Square,
  Wrench,
} from "lucide-react";

interface LiveCaptureViewProps {
  sessionId: string;
  shiftSessionId: string;
  description: string | null;
  startedAt: string;
  evidenceCount: number;
  onSessionEnded: () => void;
}

export function LiveCaptureView({
  sessionId,
  shiftSessionId,
  description,
  startedAt,
  evidenceCount,
  onSessionEnded,
}: LiveCaptureViewProps) {
  const micRef = useRef<ShiftDeskMicRecorderHandle>(null);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Update elapsed timer every second
  useEffect(() => {
    function tick() {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const totalSeconds = Math.floor((now - start) / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      setElapsed(
        h > 0
          ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
          : `${m}:${s.toString().padStart(2, "0")}`
      );
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Auto-scroll transcript when new chunks arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptChunks]);

  // Poll for transcript chunks from the shift
  const pollTranscript = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/shifts/${shiftSessionId}/transcript`));
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.chunks)) {
        setTranscriptChunks(
          data.chunks
            .filter((c: { text: string | null }) => c.text)
            .map((c: { text: string }) => c.text)
        );
      }
    } catch {
      // Silently ignore — transcript polling is best-effort
    }
  }, [shiftSessionId]);

  // Initial fetch + smart polling with backoff
  useEffect(() => {
    void pollTranscript();
  }, [pollTranscript]);

  useSmartPoll({
    pollFn: pollTranscript,
    enabled: !ending,
    initialIntervalMs: 3000,
    maxIntervalMs: 10000,
    backoffFactor: 1.3,
    resetKey: transcriptChunks.length,
  });

  // End the capture session: stop mic, PATCH session to capture_complete
  async function handleEndSession() {
    setEnding(true);
    try {
      if (micRef.current?.isRecording()) {
        await micRef.current.stopAndFlush();
      }

      const res = await fetch(apiUrl(`/api/sessions/${sessionId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "capture_complete" }),
      });

      if (!res.ok) throw new Error("Failed to end session");
      onSessionEnded();
    } catch (err) {
      console.error("Failed to end session:", err);
      setEnding(false);
    }
  }

  function handleUnauthorized(response: Response): boolean {
    if (response.status === 401 || response.status === 403) {
      window.location.reload();
      return true;
    }
    return false;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-lg mb-4"
        style={{ backgroundColor: "rgb(249, 250, 251)", border: "1px solid rgb(229, 231, 235)" }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/sessions"
            className="flex items-center"
            style={{ color: "rgb(107, 114, 128)" }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(17, 24, 39)" }}>
              {description || "Capture Session"}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(220, 38, 38)" }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              Capturing
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm" style={{ color: "rgb(107, 114, 128)" }}>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {elapsed}
            </span>
            <span className="flex items-center gap-1">
              <Camera className="h-4 w-4" />
              {evidenceCount}
            </span>
          </div>
          <Button
            onClick={() => void handleEndSession()}
            disabled={ending}
            size="sm"
            className="gap-2"
            style={{ backgroundColor: "rgb(17, 24, 39)", color: "white" }}
          >
            {ending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            End Session
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left panel: Measurements */}
        <Card className="border-0 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b" style={{ borderColor: "rgb(243, 244, 246)" }}>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" style={{ color: "rgb(107, 114, 128)" }} />
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(17, 24, 39)" }}>
                Measurements
              </h2>
            </div>
          </div>
          <CardContent className="flex-1 overflow-y-auto p-4">
            <MeasurementFeed shiftId={shiftSessionId} isActive={true} />
          </CardContent>
        </Card>

        {/* Right panel: Live Transcript + Mic Controls */}
        <Card className="border-0 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b" style={{ borderColor: "rgb(243, 244, 246)" }}>
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4" style={{ color: "rgb(107, 114, 128)" }} />
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(17, 24, 39)" }}>
                Live Transcript
              </h2>
            </div>
          </div>
          <CardContent className="flex-1 overflow-y-auto p-4">
            {transcriptChunks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mic className="h-8 w-8 mb-3" style={{ color: "rgb(209, 213, 219)" }} />
                <p className="text-sm" style={{ color: "rgb(107, 114, 128)" }}>
                  No transcript yet
                </p>
                <p className="text-xs mt-1" style={{ color: "rgb(156, 163, 175)" }}>
                  Start recording to see live transcription here
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-sm leading-relaxed" style={{ color: "rgb(55, 65, 81)" }}>
                {transcriptChunks.map((chunk, i) => (
                  <p key={i}>{chunk}</p>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </CardContent>

          {/* Mic recorder controls pinned at the bottom */}
          <div className="px-4 py-3 border-t" style={{ borderColor: "rgb(243, 244, 246)" }}>
            <ShiftDeskMicRecorder
              ref={micRef}
              shiftId={shiftSessionId}
              enabled={true}
              onUnauthorized={handleUnauthorized}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
