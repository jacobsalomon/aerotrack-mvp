// Login page — supports OAuth (Google / Microsoft) and passcode fallback.
// When OAuth providers are configured, shows "Sign in with Google/Microsoft" buttons.
// Always shows the passcode field as a fallback for demo environments.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plane } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Passcode login (existing system — always available)
  async function handlePasscodeLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/auth/verify-passcode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();

      if (data.success) {
        router.push("/demo");
      } else {
        setError(data.error || "Invalid passcode");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  // OAuth sign-in — redirects to the provider's login page
  function handleOAuthSignIn(provider: "google" | "microsoft-entra-id") {
    // Auth.js handles the redirect flow at /api/auth/signin/{provider}
    window.location.href = apiUrl(
      `/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent("/demo")}`
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: "rgb(12, 12, 12)" }}
    >
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6">
            <Plane className="h-7 w-7" style={{ color: "rgb(230, 227, 224)" }} />
          </div>
          <h1
            className="mt-4 text-2xl font-bold tracking-tight"
            style={{ color: "rgb(230, 227, 224)" }}
          >
            AeroVision
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Sign in to continue
          </p>
        </div>

        {/* OAuth buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handleOAuthSignIn("google")}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          <button
            onClick={() => handleOAuthSignIn("microsoft-entra-id")}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/30">or use passcode</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Passcode form */}
        <form onSubmit={handlePasscodeLogin} className="space-y-4">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
            autoFocus
          />

          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !passcode}
            className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Verifying..." : "Continue with Passcode"}
          </button>
        </form>

        <p className="text-center text-xs text-white/20">
          The Mechanical Vision Corporation
        </p>
      </div>
    </div>
  );
}
