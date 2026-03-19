// Join Organization page — shown to logged-in users who aren't assigned to an org yet.
// Most users will never see this (domain matching auto-assigns at registration).
// For the few who register with a personal email, they can enter an invite code here.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plane, Building2 } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

export default function JoinOrgPage() {
  const router = useRouter();
  const { update } = useSession();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
        // Refresh the session so the JWT picks up the new organizationId
        await update();
        router.push("/sessions");
      } else {
        setError(data.error || "Failed to join organization");
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
            <Building2 className="h-7 w-7" style={{ color: "rgb(230, 227, 224)" }} />
          </div>
          <h1
            className="mt-4 text-2xl font-bold tracking-tight"
            style={{ color: "rgb(230, 227, 224)" }}
          >
            Join Your Organization
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Enter the invite code from your organization admin to get started.
          </p>
        </div>

        {/* Invite code form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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

        <p className="text-center text-xs text-white/20">
          <Plane className="mr-1 inline-block h-3 w-3" />
          The Mechanical Vision Corporation
        </p>
      </div>
    </div>
  );
}
