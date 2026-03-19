"use client";

// Live Session Panel — shown on the session detail page when a session is actively capturing.
// Auto-starts desk mic recording. Shows real-time transcript, stream status, evidence count,
// and an "End Session" button. Supports audio-only sessions (no glasses required).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SessionDeskMicRecorder,
  type SessionDeskMicRecorderHandle,
} from "@/components/session-desk-mic-recorder";
import {
  Mic,
  FileStack,
  Clock,
  StopCircle,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { apiUrl } from "@/lib/api-url";

interface LiveSessionPanelProps {
  sessionId: string;
  evidenceCount: number;
  startedAt: string;
  hasGlassesStream: boolean;
  onSessionEnded: () => void;
}

export function LiveSessionPanel({
  sessionId,
  evidenceCount: initialEvidenceCount,
  startedAt,
  hasGlassesStream,
  onSessionEnded,
}: LiveSessionPanelProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [ending, setEnding] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [localEvidenceCount, setLocalEvidenceCount] = useState(initialEvidenceCount);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const recorderRef = useRef<SessionDeskMicRecorderHandle>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalEvidenceCount((prev) => Math.max(prev, initialEvidenceCount));
  }, [initialEvidenceCount]);

  // Elapsed time counter
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () =>
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Auto-scroll transcript to bottom when new lines arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptLines]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  const handleTranscript = useCallback((text: string) => {
    setTranscriptLines((prev) => [...prev, text]);
  }, []);

  const handleEndSession = useCallback(async () => {
    setEnding(true);
    try {
      if (recorderRef.current?.isRecording()) {
        await recorderRef.current.stopAndFlush();
      }

      const res = await fetch(apiUrl(`/api/sessions/${sessionId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "capture_complete" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to end session (${res.status})`);
      }

      onSessionEnded();
    } catch (err) {
      console.error("Failed to end session:", err);
      setEnding(false);
    }
  }, [sessionId, onSessionEnded]);

  return (
    <Card
      className="border-0 shadow-sm mb-6"
      style={{
        borderLeft: "4px solid rgb(239, 68, 68)",
        background:
          "linear-gradient(135deg, rgba(254, 242, 242, 0.5) 0%, rgba(255, 255, 255, 1) 100%)",
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-lg font-bold flex items-center gap-2"
            style={{
              fontFamily: "var(--font-space-grotesk)",
              color: "rgb(20, 20, 20)",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: "rgb(239, 68, 68)" }}
            />
            Live Capture
          </CardTitle>
          <span
            className="text-sm font-mono"
            style={{ color: "rgb(100, 100, 100)" }}
          >
            <Clock className="inline h-3.5 w-3.5 mr-1" />
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stream status row */}
        <div
          className="flex items-center gap-4 text-xs rounded-lg border px-4 py-2.5"
          style={{
            borderColor: "rgba(148, 163, 184, 0.2)",
            backgroundColor: "rgb(248, 250, 252)",
          }}
        >
          <span className="flex items-center gap-1.5">
            <Mic
              className="h-3.5 w-3.5"
              style={{
                color: micActive ? "rgb(239, 68, 68)" : "rgb(148, 163, 184)",
              }}
            />
            <span style={{ color: "rgb(60, 60, 60)" }}>
              Desk Mic: <strong>{micActive ? "Recording" : "Ready"}</strong>
            </span>
          </span>
          <span
            className="w-px h-3.5"
            style={{ backgroundColor: "rgb(226, 232, 240)" }}
          />
          <span className="flex items-center gap-1.5">
            {hasGlassesStream ? (
              <Wifi className="h-3.5 w-3.5" style={{ color: "rgb(34, 197, 94)" }} />
            ) : (
              <WifiOff className="h-3.5 w-3.5" style={{ color: "rgb(148, 163, 184)" }} />
            )}
            <span style={{ color: "rgb(60, 60, 60)" }}>
              Glasses: <strong>{hasGlassesStream ? "Connected" : "Not joined"}</strong>
            </span>
          </span>
          <span
            className="w-px h-3.5"
            style={{ backgroundColor: "rgb(226, 232, 240)" }}
          />
          <span className="flex items-center gap-1.5">
            <FileStack className="h-3.5 w-3.5" style={{ color: "rgb(59, 130, 246)" }} />
            <span style={{ color: "rgb(60, 60, 60)" }}>
              <strong>{localEvidenceCount}</strong> evidence
            </span>
          </span>
        </div>

        {/* Desk mic recorder — auto-starts on mount */}
        <SessionDeskMicRecorder
          ref={recorderRef}
          sessionId={sessionId}
          autoStart
          onRecordingStateChange={setMicActive}
          onTranscript={handleTranscript}
          onChunkUploaded={() => setLocalEvidenceCount((c) => c + 1)}
        />

        {/* Live transcript — shows what the AI is hearing in real time */}
        {transcriptLines.length > 0 && (
          <div
            className="rounded-lg border px-4 py-3 max-h-48 overflow-y-auto"
            style={{
              borderColor: "rgba(148, 163, 184, 0.2)",
              backgroundColor: "rgb(248, 250, 252)",
            }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "rgb(148, 163, 184)" }}
            >
              Live Transcript
            </p>
            <div
              className="text-sm leading-relaxed space-y-1"
              style={{ color: "rgb(60, 60, 60)" }}
            >
              {transcriptLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* End session button */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => void handleEndSession()}
          disabled={ending}
        >
          {ending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <StopCircle className="mr-2 h-4 w-4" />
          )}
          {ending ? "Ending Session..." : "End Session"}
        </Button>
      </CardContent>
    </Card>
  );
}
