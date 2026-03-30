"use client";

// QR Pairing Dialog — connects the mechanic's glasses to this job.
// The mechanic either scans the QR with their iPhone camera (auto-opens the app via URL scheme)
// or manually types the 6-character code in the app.
// Polls every 3 seconds to detect when the code is claimed (code becomes null).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { apiUrl } from "@/lib/api-url";
import { CheckCircle2, Loader2, RefreshCw, Glasses } from "lucide-react";

interface QRPairingDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaired?: () => void;
}

export function QRPairingDialog({
  sessionId,
  open,
  onOpenChange,
  onPaired,
}: QRPairingDialogProps) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate a new pairing code
  const generateCode = useCallback(async () => {
    setLoading(true);
    setCode(null); // Hide expired QR immediately during refresh
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

  // Poll to check if the code was claimed
  useEffect(() => {
    if (!open || !code || paired) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/pairing-code`), {
          method: "GET",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.data?.claimed) {
          setPaired(true);
          onPaired?.();
        }
      } catch {
        // Ignore poll errors — will retry
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, code, paired, sessionId, onPaired]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || paired) return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        void generateCode();
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [expiresAt, paired, generateCode]);

  // Generate code when dialog opens
  useEffect(() => {
    if (open && !code && !loading) {
      void generateCode();
    }
    if (!open) {
      setCode(null);
      setPaired(false);
      setError(null);
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [open, code, loading, generateCode]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  // Deep link URL that iOS Camera app will recognize
  const deepLink = code ? `aerovision-glass://pair?code=${code}` : "";

  // Auto-close after pairing
  useEffect(() => {
    if (paired) {
      const timeout = setTimeout(() => onOpenChange(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [paired, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Glasses className="h-5 w-5" />
            Connect Glasses
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-4">
          {/* Success state */}
          {paired && (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold text-emerald-700">Glasses Connected!</p>
              <p className="text-sm text-slate-500">Your glasses are paired to this job.</p>
            </div>
          )}

          {/* Loading state */}
          {loading && !paired && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <p className="text-sm text-slate-500">Generating pairing code...</p>
            </div>
          )}

          {/* Error state */}
          {error && !paired && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-red-500">{error}</p>
              <Button onClick={() => void generateCode()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* QR code + text code */}
          {code && !loading && !paired && !error && (
            <>
              {/* QR code */}
              <div className="rounded-xl border-2 border-slate-200 bg-white p-4">
                <QRCodeSVG
                  value={deepLink}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>

              <p className="text-xs text-slate-400">
                Point the iPhone camera at this code
              </p>

              {/* Divider */}
              <div className="flex items-center gap-3 w-full px-4">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-xs text-slate-400">or enter code in Glass app</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              {/* Text code */}
              <div className="flex items-center gap-1.5">
                {code.split("").map((char, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center w-10 h-12 rounded-lg border-2 border-slate-300 bg-slate-50 text-lg font-mono font-bold text-slate-800"
                  >
                    {char}
                  </div>
                ))}
              </div>

              {/* Countdown */}
              <p className="text-xs text-slate-400">
                Expires in {minutes}:{seconds.toString().padStart(2, "0")}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
