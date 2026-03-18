"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { apiUrl } from "@/lib/api-url";

const SESSION_KEY = "demo-unlocked";

// Passcode gate — wraps protected content.
// Collects name, email, and a 4-digit code before granting access.
// Validates server-side and sets an HTTP-only cookie on success.
export default function PasscodeGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Check if already unlocked (wait for hydration to avoid flash)
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      fetch(apiUrl("/api/auth/check"), { method: "HEAD" })
        .then((res) => {
          if (res.ok) {
            setUnlocked(true);
          } else {
            sessionStorage.removeItem(SESSION_KEY);
          }
        })
        .catch(() => {
          setUnlocked(true);
        })
        .finally(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");

    if (!name.trim()) {
      setError("Please enter your name");
      nameRef.current?.focus();
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email");
      return;
    }
    if (code.length < 4) {
      setError("Please enter the 4-digit code");
      inputRefs.current[0]?.focus();
      return;
    }

    setChecking(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/auth/verify-passcode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code, name: name.trim(), email: email.trim() }),
      });

      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, "true");
        setUnlocked(true);
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError("Incorrect code");
          setTimeout(() => {
            setDigits(["", "", "", ""]);
            setChecking(false);
            inputRefs.current[0]?.focus();
          }, 600);
          return;
        }
        setError(data.error || "Something went wrong");
        setChecking(false);
      }
    } catch {
      setError("Connection error — please try again");
      setChecking(false);
    }
  }

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Auto-focus name field on mount
  useEffect(() => {
    if (!unlocked && hydrated) {
      nameRef.current?.focus();
    }
  }, [unlocked, hydrated]);

  if (unlocked) return <>{children}</>;
  if (!hydrated) return null;

  const isShaking = error === "Incorrect code";

  return (
    <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: 'rgb(12, 12, 12)' }}>
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6 w-full max-w-sm px-6">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(230, 227, 224)' }}>
            AeroVision
          </div>
          <p className="text-sm" style={{ color: 'rgba(230, 227, 224, 0.5)' }}>
            Enter your details and access code
          </p>
        </div>

        {/* Name field */}
        <input
          ref={nameRef}
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-12 px-4 rounded-md text-sm outline-none transition-all"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid rgba(230, 227, 224, 0.2)',
            color: 'rgb(230, 227, 224)',
          }}
          autoComplete="name"
        />

        {/* Email field */}
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full h-12 px-4 rounded-md text-sm outline-none transition-all"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid rgba(230, 227, 224, 0.2)',
            color: 'rgb(230, 227, 224)',
          }}
          autoComplete="email"
        />

        {/* Code label */}
        <p className="text-xs" style={{ color: 'rgba(230, 227, 224, 0.4)' }}>
          Access code
        </p>

        {/* 4-digit input */}
        <div className={`flex gap-3 ${isShaking ? "animate-shake" : ""}`}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={`Passcode digit ${i + 1}`}
              className="w-14 h-16 text-center text-2xl font-mono rounded-md outline-none transition-all"
              style={isShaking ? {
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

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={checking}
          className="w-full h-12 rounded-md text-sm font-medium transition-all"
          style={{
            backgroundColor: checking ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
            color: checking ? 'rgba(230, 227, 224, 0.4)' : 'rgb(230, 227, 224)',
            border: '2px solid rgba(230, 227, 224, 0.15)',
            cursor: checking ? 'not-allowed' : 'pointer',
          }}
        >
          {checking ? "Verifying..." : "Continue"}
        </button>

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
      </form>

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
