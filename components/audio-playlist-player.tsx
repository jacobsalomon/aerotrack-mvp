"use client";

// Playlist-style Audio Player
// Replaces individual per-chunk audio players with a single unified player
// that auto-advances through all audio chunks like one continuous recording.

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

export interface AudioChunk {
  id: string;
  url: string;
  mimeType: string;
  durationSeconds: number | null;
  label?: string; // e.g. timestamp or chunk number
}

interface AudioPlaylistPlayerProps {
  chunks: AudioChunk[];
}

// Format seconds as m:ss
function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlaylistPlayer({ chunks }: AudioPlaylistPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Use reported durations for each chunk (fall back to 0 if unknown)
  const chunkDurations = chunks.map((c) => c.durationSeconds ?? 0);
  const totalDuration = chunkDurations.reduce((sum, d) => sum + d, 0);

  // Time elapsed before the current chunk starts
  const timeBeforeCurrent = chunkDurations
    .slice(0, currentIndex)
    .reduce((sum, d) => sum + d, 0);

  // Overall progress across all chunks (0-1)
  const globalTime = timeBeforeCurrent + currentTime;
  const globalProgress = totalDuration > 0 ? globalTime / totalDuration : 0;

  // Load a specific chunk into the audio element
  const loadChunk = useCallback(
    (index: number, autoPlay: boolean) => {
      const audio = audioRef.current;
      if (!audio || index < 0 || index >= chunks.length) return;
      audio.src = chunks[index].url;
      audio.load();
      setCurrentIndex(index);
      setCurrentTime(0);
      if (autoPlay) {
        audio.play().catch(() => {});
      }
    },
    [chunks]
  );

  // Set up the first chunk on mount
  useEffect(() => {
    if (chunks.length > 0 && audioRef.current) {
      audioRef.current.src = chunks[0].url;
      audioRef.current.load();
    }
  }, [chunks]);

  // Play/pause toggle
  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }

  // Skip to next/previous chunk
  function skipNext() {
    if (currentIndex < chunks.length - 1) {
      loadChunk(currentIndex + 1, isPlaying);
    }
  }
  function skipPrev() {
    // If more than 3s into chunk, restart it; otherwise go to previous
    if (currentTime > 3 && audioRef.current) {
      audioRef.current.currentTime = 0;
    } else if (currentIndex > 0) {
      loadChunk(currentIndex - 1, isPlaying);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }

  // Handle clicking on the progress bar to seek
  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = clickX / rect.width;
    const targetTime = fraction * totalDuration;

    // Figure out which chunk this lands in
    let accumulated = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkEnd = accumulated + chunkDurations[i];
      if (targetTime <= chunkEnd || i === chunks.length - 1) {
        const offset = targetTime - accumulated;
        if (i !== currentIndex) {
          loadChunk(i, isPlaying);
          // Small delay to let the audio load, then seek
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = Math.max(0, offset);
            }
          }, 100);
        } else if (audioRef.current) {
          audioRef.current.currentTime = Math.max(0, offset);
        }
        break;
      }
      accumulated = chunkEnd;
    }
  }

  // Handle clicking on a specific chunk segment
  function handleChunkClick(index: number) {
    if (index !== currentIndex) {
      loadChunk(index, isPlaying);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "rgb(230, 230, 230)", backgroundColor: "rgb(252, 252, 252)" }}>
      {/* Hidden audio element — we control everything with custom UI */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onEnded={() => {
          if (currentIndex < chunks.length - 1) {
            loadChunk(currentIndex + 1, true);
          } else {
            setIsPlaying(false);
            setCurrentTime(chunkDurations[currentIndex]);
          }
        }}
      />

      {/* Controls row: skip-back, play/pause, skip-forward, progress, time */}
      <div className="flex items-center gap-3">
        {/* Transport controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={skipPrev}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title="Previous chunk"
          >
            <SkipBack className="h-4 w-4" style={{ color: "rgb(80, 80, 80)" }} />
          </button>
          <button
            onClick={togglePlay}
            className="p-2 rounded-full transition-colors"
            style={{ backgroundColor: "rgb(99, 102, 241)", color: "white" }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <button
            onClick={skipNext}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title="Next chunk"
            disabled={currentIndex >= chunks.length - 1}
            style={{ opacity: currentIndex >= chunks.length - 1 ? 0.3 : 1 }}
          >
            <SkipForward className="h-4 w-4" style={{ color: "rgb(80, 80, 80)" }} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex-1 min-w-0">
          <div
            className="relative h-2 rounded-full cursor-pointer group"
            style={{ backgroundColor: "rgb(230, 230, 230)" }}
            onClick={handleProgressClick}
          >
            {/* Filled progress */}
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-150"
              style={{
                width: `${globalProgress * 100}%`,
                backgroundColor: "rgb(99, 102, 241)",
              }}
            />
            {/* Chunk boundary markers */}
            {chunks.length > 1 &&
              chunkDurations.slice(0, -1).map((_, i) => {
                const pos = chunkDurations.slice(0, i + 1).reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={i}
                    className="absolute top-0 w-px h-full"
                    style={{
                      left: `${totalDuration > 0 ? (pos / totalDuration) * 100 : 0}%`,
                      backgroundColor: "rgb(180, 180, 180)",
                    }}
                  />
                );
              })}
          </div>
        </div>

        {/* Time display */}
        <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: "rgb(100, 100, 100)" }}>
          {fmtTime(globalTime)} / {fmtTime(totalDuration)}
        </span>
      </div>

      {/* Chunk segments row */}
      {chunks.length > 1 && (
        <div className="flex gap-1 mt-2.5">
          {chunks.map((chunk, i) => {
            const isActive = i === currentIndex;
            return (
              <button
                key={chunk.id}
                onClick={() => handleChunkClick(i)}
                className="flex-1 text-center rounded-md py-1 transition-colors text-[10px] font-medium"
                style={{
                  backgroundColor: isActive ? "rgb(238, 239, 255)" : "rgb(245, 245, 245)",
                  color: isActive ? "rgb(99, 102, 241)" : "rgb(140, 140, 140)",
                  borderWidth: "1px",
                  borderColor: isActive ? "rgb(199, 201, 254)" : "transparent",
                }}
                title={`Chunk ${i + 1}${chunk.label ? ` — ${chunk.label}` : ""}`}
              >
                {chunk.label || `Chunk ${i + 1}`}
                {chunkDurations[i] > 0 && (
                  <span className="ml-1 opacity-60">{fmtTime(chunkDurations[i])}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
