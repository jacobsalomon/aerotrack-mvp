"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";

const PASSCODE = "2206";
const SESSION_KEY = "demo-unlocked";

// Client-side passcode gate — wraps protected content.
// Stores unlock state in sessionStorage so the user only
// enters the code once per browser tab.
export default function PasscodeGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check if already unlocked this session
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      setUnlocked(true);
    }
  }, []);

  // Auto-submit when all 4 digits are filled
  useEffect(() => {
    const code = digits.join("");
    if (code.length === 4) {
      if (code === PASSCODE) {
        sessionStorage.setItem(SESSION_KEY, "true");
        setUnlocked(true);
      } else {
        setError(true);
        // Clear after a brief shake animation
        setTimeout(() => {
          setDigits(["", "", "", ""]);
          setError(false);
          inputRefs.current[0]?.focus();
        }, 600);
      }
    }
  }, [digits]);

  const handleChange = (index: number, value: string) => {
    // Only accept single digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    // Auto-advance to next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Backspace moves to previous input
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Auto-focus first input on mount
  useEffect(() => {
    if (!unlocked) {
      inputRefs.current[0]?.focus();
    }
  }, [unlocked]);

  if (unlocked) return <>{children}</>;

  return (
    <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: 'rgb(12, 12, 12)' }}>
      <div className="flex flex-col items-center gap-8">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(230, 227, 224)' }}>
            AeroVision
          </div>
          <p className="text-sm" style={{ color: 'rgba(230, 227, 224, 0.5)' }}>
            Enter access code to continue
          </p>
        </div>

        {/* 4-digit input */}
        <div
          className={`flex gap-3 ${error ? "animate-shake" : ""}`}
        >
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-14 h-16 text-center text-2xl font-mono rounded-md outline-none transition-all
                ${error ? "" : ""}`}
              style={error ? {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '2px solid rgb(220, 38, 38)',
                color: 'rgb(230, 227, 224)'
              } : {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '2px solid rgba(230, 227, 224, 0.2)',
                color: 'rgb(230, 227, 224)'
              }}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400">Incorrect code</p>
        )}

        {/* Contact for access */}
        <p className="text-sm" style={{ color: 'rgba(230, 227, 224, 0.4)' }}>
          Need access?{" "}
          <a
            href="mailto:jacobrsalomon@gmail.com"
            className="transition-colors underline hover:opacity-80"
            style={{ color: 'rgba(230, 227, 224, 0.6)' }}
          >
            jacobrsalomon@gmail.com
          </a>
        </p>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
