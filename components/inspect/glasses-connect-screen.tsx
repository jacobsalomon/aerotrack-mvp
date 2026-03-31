"use client";

// Full-screen glasses connection step — shown when starting an inspection
// without glasses connected. Big QR code, clear numbered steps, can't miss it.
// Designed for 55-year-old blue collar workers in a shop environment.
// Reuses the same pairing-code API as QRPairingDialog.

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiUrl } from "@/lib/api-url";
import { CheckCircle2, Glasses, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GlassesConnectScreenProps {
  sessionId: string;
  onPaired: () => void;
  onSkip: () => void;
}

export default function GlassesConnectScreen({
  sessionId,
  onPaired,
  onSkip,
}: GlassesConnectScreenProps) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref to ensure onPaired only fires once (prevents double-fire from re-renders)
  const pairedHandledRef = useRef(false);

  // Generate a new pairing code
  const generateCode = useCallback(async () => {
    setLoading(true);
    setCode(null);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/pairing-code`), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate code");
      const data = await res.json();
      setCode(data.data.code);
      setExpiresAt(new Date(data.data.expiresAt));
      setPaired(false);
    } catch {
      setError("Failed to generate pairing code. Try again.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Poll to check if the code was claimed by the iOS app
  useEffect(() => {
    if (!code || paired) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/pairing-code`), {
          method: "GET",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.data?.claimed) {
          setPaired(true);
        }
      } catch {
        // Ignore poll errors — will retry
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [code, paired, sessionId]);

  // Countdown timer — auto-regenerates when expired
  useEffect(() => {
    if (!expiresAt || paired) return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        // Stop the countdown so we don't fire multiple POST requests
        if (countdownRef.current) clearInterval(countdownRef.current);
        void generateCode();
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [expiresAt, paired, generateCode]);

  // Generate code on mount
  useEffect(() => {
    void generateCode();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-transition to workspace after successful pairing.
  // Uses a ref to ensure it only fires once (parent re-renders won't restart the timer).
  useEffect(() => {
    if (paired && !pairedHandledRef.current) {
      pairedHandledRef.current = true;
      const timeout = setTimeout(() => onPaired(), 2000);
      return () => clearTimeout(timeout);
    }
  }, [paired, onPaired]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const deepLink = code ? `aerovision-glass://pair?code=${code}` : "";

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg flex flex-col items-center gap-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-20 w-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Glasses className="h-10 w-10 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">Connect Your Glasses</h1>
        </div>

        {/* Success state */}
        {paired && (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="h-20 w-20 text-emerald-500" />
            <p className="text-2xl font-semibold text-emerald-400">
              Glasses Connected!
            </p>
            <p className="text-lg text-white/50">
              Starting inspection...
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && !paired && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-white/30" />
            <p className="text-lg text-white/50">Getting ready...</p>
          </div>
        )}

        {/* Error state */}
        {error && !paired && (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-lg text-red-400">{error}</p>
            <Button
              onClick={() => void generateCode()}
              variant="outline"
              size="lg"
              className="gap-2 border-white/20 text-white/70 text-base"
            >
              <RefreshCw className="h-5 w-5" /> Try Again
            </Button>
          </div>
        )}

        {/* QR code + instructions */}
        {code && !loading && !paired && !error && (
          <>
            {/* Step-by-step instructions — large, clear, numbered */}
            <div className="w-full space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-bold flex items-center justify-center">
                  1
                </span>
                <p className="text-base text-white/80 pt-0.5">
                  Open the <span className="font-semibold text-white">AeroVision Glass</span> app on your iPhone
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-bold flex items-center justify-center">
                  2
                </span>
                <p className="text-base text-white/80 pt-0.5">
                  Point your iPhone camera at the code below
                </p>
              </div>
            </div>

            {/* Large QR code on white background */}
            <div className="rounded-2xl border-2 border-white/10 bg-white p-8">
              <QRCodeSVG
                value={deepLink}
                size={240}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-sm text-white/30">or type this code in the app</span>
              <div className="flex-1 border-t border-white/10" />
            </div>

            {/* Large manual code boxes */}
            <div className="flex items-center gap-2.5">
              {code.split("").map((char, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center w-14 h-16 rounded-xl border-2 border-white/20 bg-zinc-900 text-2xl font-mono font-bold text-emerald-400"
                >
                  {char}
                </div>
              ))}
            </div>

            {/* Countdown */}
            <p className="text-sm text-white/30">
              Code expires in {minutes}:{seconds.toString().padStart(2, "0")}
            </p>
          </>
        )}

        {/* Skip button — visible but not prominent */}
        {!paired && !loading && (
          <button
            onClick={onSkip}
            className="mt-2 text-base text-white/40 hover:text-white/60 underline underline-offset-4 transition-colors"
          >
            Continue without glasses
          </button>
        )}
      </div>
    </div>
  );
}
