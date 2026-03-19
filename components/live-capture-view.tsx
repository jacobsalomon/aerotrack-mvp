"use client";

// Live Capture View — shown when a session is actively capturing (status === "capturing").
// Three-layer transcript architecture:
//   1. Web Speech API — instant draft text (local only, italic)
//   2. ElevenLabs Scribe v2 — server-transcribed 15s chunks (normal weight)
//   3. LLM correction — cleaned up text with formatted measurements/part numbers (checkmark)
// Two-panel layout: measurements on the left, live transcript on the right.

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
  Check,
  Clock,
  Loader2,
  Mic,
  Square,
  Wrench,
} from "lucide-react";

// ── Types for the multi-layer transcript ────────────────────────────

interface TranscriptSegment {
  id: string;
  text: string;
  correctionStatus: "raw" | "correcting" | "corrected" | "failed";
}

interface LiveCaptureViewProps {
  sessionId: string;
  shiftSessionId: string;
  description: string | null;
  startedAt: string;
  onSessionEnded: () => void;
}

// ── Web Speech API hook ─────────────────────────────────────────────
// Uses the browser's built-in speech recognition for instant text display.
// This is LOCAL ONLY — not saved to the database. It shows the mechanic
// their words instantly, then gets replaced by the server transcription.

function useWebSpeechRecognition(enabled: boolean, serverSegmentCount: number) {
  const [draftText, setDraftText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Accumulate finalized results so text stays visible until server replaces it
  const finalizedRef = useRef("");

  // When new server segments arrive, clear the finalized buffer since the
  // server transcript now covers what the user said
  const prevSegmentCountRef = useRef(serverSegmentCount);
  useEffect(() => {
    if (serverSegmentCount > prevSegmentCountRef.current) {
      finalizedRef.current = "";
      setDraftText("");
    }
    prevSegmentCountRef.current = serverSegmentCount;
  }, [serverSegmentCount]);

  useEffect(() => {
    // Check if Web Speech API is available (Chrome is the main target)
    const SpeechRecognitionClass =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionClass) {
      setSupported(false);
      return;
    }

    if (!enabled) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Build text from finalized + current interim results
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Accumulate finalized text so it stays visible
          finalizedRef.current += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      // Show: all finalized text we've accumulated + the current interim words
      setDraftText((finalizedRef.current + interim).trim());
    };

    recognition.onstart = () => setIsListening(true);

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if still enabled (Web Speech API stops after silence)
      if (enabledRef.current) {
        try {
          recognition.start();
        } catch {
          // Ignore — might already be starting
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are normal — just means silence or page nav
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[WebSpeech] Error:", event.error);
      }
    };

    try {
      recognition.start();
    } catch {
      // Ignore — already started
    }

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [enabled]);

  return { draftText, isListening, supported };
}

// ── Main component ──────────────────────────────────────────────────

export function LiveCaptureView({
  sessionId,
  shiftSessionId,
  description,
  startedAt,
  onSessionEnded,
}: LiveCaptureViewProps) {
  const micRef = useRef<ShiftDeskMicRecorderHandle>(null);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Web Speech API for instant draft text
  const { draftText, isListening, supported: webSpeechSupported } =
    useWebSpeechRecognition(!ending, segments.length);

  // Track whether user is scrolled to bottom (for auto-scroll behavior)
  const isAtBottomRef = useRef(true);

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

  // Track scroll position — only auto-scroll if user is already at bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    function handleScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll when new content arrives (only if already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments, draftText]);

  // Poll for transcript chunks from the server
  const pollTranscript = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/shifts/${shiftSessionId}/transcript`));
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.chunks)) {
        setSegments(
          data.chunks
            .filter((c: { text: string | null }) => c.text)
            .map((c: { id: string; text: string; correctionStatus: string }) => ({
              id: c.id,
              text: c.text,
              correctionStatus: c.correctionStatus as TranscriptSegment["correctionStatus"],
            }))
        );
      }
    } catch {
      // Silently ignore — transcript polling is best-effort
    }
  }, [shiftSessionId]);

  useEffect(() => {
    void pollTranscript();
  }, [pollTranscript]);

  useSmartPoll({
    pollFn: pollTranscript,
    enabled: !ending,
    initialIntervalMs: 3000,
    maxIntervalMs: 10000,
    backoffFactor: 1.3,
    resetKey: segments.length,
  });

  // Count corrected vs total segments for the status indicator
  const correctedCount = segments.filter((s) => s.correctionStatus === "corrected").length;
  const correctingCount = segments.filter((s) => s.correctionStatus === "correcting").length;

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
          <span className="flex items-center gap-1 text-sm" style={{ color: "rgb(107, 114, 128)" }}>
            <Clock className="h-4 w-4" />
            {elapsed}
          </span>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4" style={{ color: "rgb(107, 114, 128)" }} />
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(17, 24, 39)" }}>
                  Live Transcript
                </h2>
                {/* Web Speech API status indicator */}
                {webSpeechSupported && isListening && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ backgroundColor: "rgba(34, 197, 94, 0.1)", color: "rgb(22, 163, 74)" }}
                  >
                    LIVE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Correction progress indicator */}
                {segments.length > 0 && (
                  <span className="text-xs" style={{ color: "rgb(156, 163, 175)" }}>
                    {correctedCount}/{segments.length} verified
                    {correctingCount > 0 && (
                      <span style={{ color: "rgb(59, 130, 246)" }}> · {correctingCount} processing</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
          <CardContent ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
            {segments.length === 0 && !draftText ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mic className="h-8 w-8 mb-3" style={{ color: "rgb(209, 213, 219)" }} />
                <p className="text-sm" style={{ color: "rgb(107, 114, 128)" }}>
                  Listening...
                </p>
                <p className="text-xs mt-1" style={{ color: "rgb(156, 163, 175)" }}>
                  {webSpeechSupported
                    ? "Speak normally — words appear instantly, then get refined"
                    : "Speak normally — transcription appears here every 15 seconds"}
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-sm leading-relaxed">
                {/* Server-transcribed segments (from polling) */}
                {segments.map((segment) => (
                  <div key={segment.id} className="flex items-start gap-1.5">
                    <p
                      style={{
                        color: segment.correctionStatus === "corrected"
                          ? "rgb(17, 24, 39)"
                          : "rgb(55, 65, 81)",
                      }}
                    >
                      {segment.text}
                    </p>
                    {/* Show a small checkmark for verified/corrected segments */}
                    {segment.correctionStatus === "corrected" && (
                      <Check
                        className="h-3.5 w-3.5 mt-0.5 shrink-0"
                        style={{ color: "rgb(34, 197, 94)" }}
                      />
                    )}
                    {segment.correctionStatus === "correcting" && (
                      <Loader2
                        className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin"
                        style={{ color: "rgb(59, 130, 246)" }}
                      />
                    )}
                  </div>
                ))}

                {/* Live draft from Web Speech API (italic, lighter — local only) */}
                {draftText && (
                  <p
                    className="italic"
                    style={{ color: "rgb(156, 163, 175)" }}
                  >
                    {draftText}
                  </p>
                )}

                <div ref={transcriptEndRef} />
              </div>
            )}
          </CardContent>

          {/* Compact mic controls pinned at the bottom */}
          <div className="px-4 py-3 border-t" style={{ borderColor: "rgb(243, 244, 246)" }}>
            <ShiftDeskMicRecorder
              ref={micRef}
              shiftId={shiftSessionId}
              enabled={true}
              autoStart={true}
              compact={true}
              onUnauthorized={handleUnauthorized}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
