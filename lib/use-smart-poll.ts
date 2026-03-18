"use client";

// Smart polling hook with exponential backoff
// Starts fast (2s), slows down over time (5s → 10s → 30s max),
// resets to fast when something changes or user interacts.
// Stops entirely when the caller says polling is done.

import { useEffect, useRef, useCallback, useState } from "react";

export interface SmartPollOptions {
  // The function to call on each poll tick
  pollFn: () => void | Promise<void>;
  // Whether polling is currently enabled (false = stopped entirely)
  enabled: boolean;
  // Starting interval in ms (default 2000)
  initialIntervalMs?: number;
  // Maximum interval in ms (default 30000)
  maxIntervalMs?: number;
  // Multiplier for each step (default 1.5)
  backoffFactor?: number;
  // A value that, when it changes, resets the interval back to fast
  // e.g. pass the session status string — when it changes, we speed up
  resetKey?: string | number | null;
}

export interface SmartPollState {
  // How many seconds since the last successful poll
  secondsSinceUpdate: number;
  // Current polling interval in ms
  currentIntervalMs: number;
  // Manually trigger an immediate poll and reset to fast interval
  pollNow: () => void;
}

export function useSmartPoll({
  pollFn,
  enabled,
  initialIntervalMs = 2000,
  maxIntervalMs = 30000,
  backoffFactor = 1.5,
  resetKey,
}: SmartPollOptions): SmartPollState {
  // Track the current interval — starts at the fast rate
  const intervalMsRef = useRef(initialIntervalMs);
  const [currentIntervalMs, setCurrentIntervalMs] = useState(initialIntervalMs);

  // Track when the last poll happened so we can show "last updated X ago"
  const lastPollTimeRef = useRef<number>(Date.now());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  // Keep pollFn in a ref so changing it doesn't restart the effect
  const pollFnRef = useRef(pollFn);
  pollFnRef.current = pollFn;

  // Track the previous resetKey so we can detect changes
  const prevResetKeyRef = useRef(resetKey);

  // Reset to fast polling (called when resetKey changes or user triggers pollNow)
  const resetToFast = useCallback(() => {
    intervalMsRef.current = initialIntervalMs;
    setCurrentIntervalMs(initialIntervalMs);
  }, [initialIntervalMs]);

  // When resetKey changes, go back to fast polling
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      resetToFast();
    }
  }, [resetKey, resetToFast]);

  // Manual "poll now" — fetches immediately and resets interval to fast
  const pollNow = useCallback(() => {
    resetToFast();
    lastPollTimeRef.current = Date.now();
    setSecondsSinceUpdate(0);
    void pollFnRef.current();
  }, [resetToFast]);

  // Listen for user interaction (clicks, key presses) to reset to fast polling
  useEffect(() => {
    if (!enabled) return;

    const handleInteraction = () => {
      // Only reset if we've backed off past the initial interval
      if (intervalMsRef.current > initialIntervalMs) {
        resetToFast();
      }
    };

    // Use capture phase so we detect clicks even if something stops propagation
    window.addEventListener("click", handleInteraction, true);
    window.addEventListener("keydown", handleInteraction, true);

    return () => {
      window.removeEventListener("click", handleInteraction, true);
      window.removeEventListener("keydown", handleInteraction, true);
    };
  }, [enabled, initialIntervalMs, resetToFast]);

  // The main polling loop with exponential backoff
  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      // Execute the poll
      try {
        await pollFnRef.current();
      } catch {
        // Errors are the caller's responsibility to handle
      }

      // Record when this poll happened
      lastPollTimeRef.current = Date.now();
      setSecondsSinceUpdate(0);

      if (cancelled) return;

      // Schedule the next tick at the current interval
      const currentMs = intervalMsRef.current;
      timeoutId = setTimeout(tick, currentMs);

      // Increase the interval for next time (exponential backoff)
      const nextMs = Math.min(
        Math.round(currentMs * backoffFactor),
        maxIntervalMs
      );
      intervalMsRef.current = nextMs;
      setCurrentIntervalMs(nextMs);
    };

    // Start the first tick after the current interval
    timeoutId = setTimeout(tick, intervalMsRef.current);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [enabled, backoffFactor, maxIntervalMs]);

  // Update the "seconds since last update" display every second
  useEffect(() => {
    if (!enabled) return;

    const ticker = setInterval(() => {
      const elapsed = Math.round((Date.now() - lastPollTimeRef.current) / 1000);
      setSecondsSinceUpdate(elapsed);
    }, 1000);

    return () => clearInterval(ticker);
  }, [enabled]);

  return { secondsSinceUpdate, currentIntervalMs, pollNow };
}

// Helper to format "X seconds ago" into a nice human-readable string
export function formatTimeSince(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}
