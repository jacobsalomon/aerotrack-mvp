"use client";

// Jobs page — unified list of all work (guided inspections + freeform captures)
// Replaces the old separate Sessions and Inspect list pages

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";
import {
  ClipboardCheck,
  Loader2,
  Plus,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { NewJobDialog } from "./new-job-dialog";

// ─── Status mapping (mechanic-friendly labels) ───────────────────────

type JobDisplayStatus = "In Progress" | "Ready to Review" | "Complete" | "Cancelled";

const STATUS_GROUP: Record<string, JobDisplayStatus> = {
  capturing: "In Progress",
  inspecting: "In Progress",
  processing: "Ready to Review",
  analysis_complete: "Ready to Review",
  documents_generated: "Ready to Review",
  reviewing: "Ready to Review",
  verified: "Complete",
  submitted: "Complete",
  approved: "Complete",
  signed_off: "Complete",
  cancelled: "Cancelled",
  rejected: "Cancelled",
};

const STATUS_COLORS: Record<JobDisplayStatus, string> = {
  "In Progress": "bg-blue-100 text-blue-700",
  "Ready to Review": "bg-amber-100 text-amber-700",
  "Complete": "bg-emerald-100 text-emerald-700",
  "Cancelled": "bg-slate-100 text-slate-500",
};

// ─── Types ────────────────────────────────────────────────────────────

interface JobSession {
  id: string;
  status: string;
  sessionType: string;
  workOrderRef: string | null;
  startedAt: string;
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    badgeNumber: string | null;
  };
  component: {
    id: string;
    partNumber: string;
    serialNumber: string | null;
    description: string;
  } | null;
}

// ─── Component ────────────────────────────────────────────────────────

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/sessions"));
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function mechanicName(user: JobSession["user"]): string {
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.name || "Unknown";
  }

  function displayStatus(status: string): JobDisplayStatus {
    return STATUS_GROUP[status] || "In Progress";
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}
            >
              Jobs
            </h1>
            <p className="text-sm mt-2" style={{ color: "rgb(100, 100, 100)" }}>
              Your work orders and inspections — all in one place.
            </p>
          </div>
          <Button
            onClick={() => setShowNewJob(true)}
            className="gap-2"
            style={{ backgroundColor: "rgb(37, 99, 235)", color: "white" }}
          >
            <Plus className="h-4 w-4" />
            New Job
          </Button>
        </div>
      </div>

      {/* Jobs list */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border px-6 py-10 text-center" style={{ borderColor: "rgb(253, 230, 138)", backgroundColor: "rgba(255, 251, 235, 0.9)" }}>
              <AlertTriangle className="h-8 w-8 mx-auto mb-3" style={{ color: "rgb(217, 119, 6)" }} />
              <p className="text-sm" style={{ color: "rgb(146, 64, 14)" }}>{error}</p>
              <Button onClick={() => void fetchJobs()} className="gap-2 mt-4" variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16" style={{ color: "rgb(140, 140, 140)" }}>
              <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No jobs yet.</p>
              <p className="text-xs mt-1">Tap New Job to start your first work order.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium uppercase tracking-wider" style={{ color: "rgb(140, 140, 140)" }}>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Work Order</th>
                    <th className="pb-3 pr-4">Component</th>
                    <th className="pb-3 pr-4">Mechanic</th>
                    <th className="pb-3 pr-4">Started</th>
                    <th className="pb-3">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const status = displayStatus(job.status);
                    return (
                      <tr
                        key={job.id}
                        className="border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50"
                        onClick={() => router.push(`/jobs/${job.id}`)}
                      >
                        <td className="py-3.5 pr-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                            {status}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4">
                          {job.workOrderRef ? (
                            <span className="font-mono text-xs font-medium text-slate-700">{job.workOrderRef}</span>
                          ) : (
                            <span className="text-slate-300">&mdash;</span>
                          )}
                        </td>
                        <td className="py-3.5 pr-4">
                          {job.component ? (
                            <div>
                              <p className="font-mono text-xs font-medium text-slate-700">{job.component.partNumber}</p>
                              {job.component.serialNumber && (
                                <p className="font-mono text-xs text-slate-400">{job.component.serialNumber}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">&mdash;</span>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 text-slate-600">
                          {mechanicName(job.user)}
                        </td>
                        <td className="py-3.5 pr-4 text-slate-500 text-xs">
                          {formatDate(job.startedAt)}
                        </td>
                        <td className="py-3.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                            {job.sessionType === "inspection" ? "Guided" : "Freeform"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Job Dialog */}
      <NewJobDialog open={showNewJob} onOpenChange={setShowNewJob} />
    </div>
  );
}
