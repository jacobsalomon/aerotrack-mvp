// Join or Create Organization page — shown to logged-in users who aren't assigned to an org yet.
// Two options: enter an invite code to join an existing org, or create a new one.

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plane, Building2, Plus, Copy, Check } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

export default function JoinOrgPage() {
  const { update } = useSession();

  // Which view is showing: "join" (invite code) or "create" (new org)
  const [mode, setMode] = useState<"join" | "create">("join");

  // Join org state
  const [inviteCode, setInviteCode] = useState("");

  // Create org state
  const [orgName, setOrgName] = useState("");

  // Success state — shows invite code after creating an org
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Shared state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Join an existing org with an invite code
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!inviteCode.trim()) {
      setError("Please enter an invite code");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/org/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        await update();
        // Full page reload so middleware picks up the refreshed JWT
        window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/sessions`;
        return;
      } else {
        setError(data.error || "Failed to join organization");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  // Create a new org
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!orgName.trim()) {
      setError("Please enter your organization name");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/org/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        // Refresh the session so the JWT picks up the new organizationId
        await update();
        // Show the invite code before redirecting
        setCreatedInviteCode(data.inviteCode);
      } else {
        setError(data.error || "Failed to create organization");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  // Copy invite code to clipboard
  function handleCopy() {
    if (createdInviteCode) {
      navigator.clipboard.writeText(createdInviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Auto-redirect to dashboard after creating an org (5 second delay to copy the invite code)
  const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/sessions`;
  useEffect(() => {
    if (!createdInviteCode) return;
    const timer = setTimeout(() => {
      window.location.href = dashboardUrl;
    }, 5000);
    return () => clearTimeout(timer);
  }, [createdInviteCode, dashboardUrl]);

  if (createdInviteCode) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        style={{ backgroundColor: "rgb(12, 12, 12)" }}
      >
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Check className="h-7 w-7 text-emerald-400" />
          </div>
          <div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "rgb(230, 227, 224)" }}
            >
              Organization Created
            </h1>
            <p className="mt-2 text-sm text-white/40">
              Share this invite code with your team so they can join.
            </p>
          </div>

          {/* Invite code display */}
          <button
            onClick={handleCopy}
            className="group mx-auto flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3 transition-colors hover:bg-white/[0.08]"
          >
            <span className="font-mono text-lg tracking-widest text-white">
              {createdInviteCode}
            </span>
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 text-white/30 group-hover:text-white/50" />
            )}
          </button>

          <button
            onClick={() => {
              window.location.href = dashboardUrl;
            }}
            className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            Continue to Dashboard
          </button>
          <p className="text-xs text-white/30">Redirecting automatically in a few seconds...</p>

          <p className="text-center text-xs text-white/20">
            <Plane className="mr-1 inline-block h-3 w-3" />
            The Mechanical Vision Corporation
          </p>
        </div>
      </div>
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
            {mode === "join" ? (
              <Building2 className="h-7 w-7" style={{ color: "rgb(230, 227, 224)" }} />
            ) : (
              <Plus className="h-7 w-7" style={{ color: "rgb(230, 227, 224)" }} />
            )}
          </div>
          <h1
            className="mt-4 text-2xl font-bold tracking-tight"
            style={{ color: "rgb(230, 227, 224)" }}
          >
            {mode === "join" ? "Join Your Organization" : "Create Organization"}
          </h1>
          <p className="mt-2 text-sm text-white/40">
            {mode === "join"
              ? "Enter the invite code from your organization admin."
              : "Set up your organization on AeroVision."}
          </p>
        </div>

        {/* Join form */}
        {mode === "join" && (
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. SLVR-8K2M"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-mono tracking-widest text-white placeholder-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
              autoFocus
            />

            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !inviteCode.trim()}
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Joining..." : "Join Organization"}
            </button>
          </form>
        )}

        {/* Create form */}
        {mode === "create" && (
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organization name"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
              autoFocus
            />

            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !orgName.trim()}
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Creating..." : "Create Organization"}
            </button>
          </form>
        )}

        {/* Toggle between join and create */}
        <p className="text-center text-sm text-white/40">
          {mode === "join" ? (
            <>
              Don&apos;t have a code?{" "}
              <button
                onClick={() => { setMode("create"); setError(null); }}
                className="text-white/60 underline transition-colors hover:text-white/80"
              >
                Create an organization
              </button>
            </>
          ) : (
            <>
              Have an invite code?{" "}
              <button
                onClick={() => { setMode("join"); setError(null); }}
                className="text-white/60 underline transition-colors hover:text-white/80"
              >
                Join an existing one
              </button>
            </>
          )}
        </p>

        <p className="text-center text-xs text-white/20">
          <Plane className="mr-1 inline-block h-3 w-3" />
          The Mechanical Vision Corporation
        </p>
      </div>
    </div>
  );
}
