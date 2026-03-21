// Login page — email/password sign-in with optional OAuth buttons.
// Shows a success banner when redirected after registration.

"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Plane, Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        // Full page load so middleware runs with the fresh JWT
        window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/sessions`;
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Success banner after registration */}
      {justRegistered && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-400">
          Account created! Sign in to continue.
        </div>
      )}

      {/* Email/password form */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
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

        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 pr-11 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/60"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-white/40 transition-colors hover:text-white/60"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Sign up link */}
      <p className="text-center text-sm text-white/40">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-white/60 underline transition-colors hover:text-white/80"
        >
          Sign up
        </Link>
      </p>

      <p className="text-center text-xs text-white/20">
        The Mechanical Vision Corporation
      </p>
    </>
  );
}

export default function LoginPage() {
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

        <Suspense fallback={<div className="text-center text-white/40 text-sm">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
