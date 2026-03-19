// Forgot password page — enter email to receive a password reset link.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Plane } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(apiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
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
            Reset Password
          </h1>
          <p className="mt-1 text-sm text-white/40">
            {sent
              ? "Check your email for a reset link"
              : "Enter your email to get a reset link"}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm text-white/60">
                If an account exists for <span className="text-white/80">{email}</span>,
                you&apos;ll receive a password reset email shortly.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-block text-sm text-white/60 underline transition-colors hover:text-white/80"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
                autoComplete="email"
                autoFocus
              />

              {error && (
                <p className="text-center text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <p className="text-center text-sm text-white/40">
              Remember your password?{" "}
              <Link
                href="/login"
                className="text-white/60 underline transition-colors hover:text-white/80"
              >
                Sign in
              </Link>
            </p>
          </>
        )}

        <p className="text-center text-xs text-white/20">
          The Mechanical Vision Corporation
        </p>
      </div>
    </div>
  );
}
