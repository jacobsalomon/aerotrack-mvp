"use client";

// Shift detail page — real-time measurement feed + spec progress + shift controls
// Polls every 3 seconds when shift is active

import { useEffect, useState, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MeasurementFeed } from "@/components/measurement-feed";
import { SpecProgress } from "@/components/spec-progress";
import { apiUrl } from "@/lib/api-url";
import {
  ArrowLeft,
  Square,
  FileDown,
  CheckCircle2,
  Loader2,
  Gauge,
  Clock,
  Mic,
} from "lucide-react";
import Link from "next/link";

interface ShiftDetail {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalDurationMin: number | null;
  notes: string | null;
  technician: { firstName: string; lastName: string; badgeNumber: string };
  measurementSpec: { specItemsJson: string; name: string } | null;
  specItems: unknown[] | null;
  measurementStatusCounts: Record<string, number>;
  _count: { measurements: number; captureSessions: number };
}

export default function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [specProgress, setSpecProgress] = useState<{
    specName: string;
    totalRequired: number;
    capturedRequired: number;
    items: Array<{
      parameterName: string;
      measurementType: string;
      unit: string;
      required?: boolean;
      index: number;
      captured: boolean;
      measurement: { status: string; inTolerance: boolean | null } | null;
    }>;
  } | null>(null);

  // Load shift detail
  useEffect(() => {
    fetch(apiUrl(`/api/shifts/${id}`))
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setShift(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Poll spec progress when shift is active
  useEffect(() => {
    if (!shift || (shift.status !== "active" && shift.status !== "paused")) return;

    const pollSpec = async () => {
      try {
        const res = await fetch(apiUrl(`/api/shifts/${id}/measurements`));
        const data = await res.json();
        if (data.success && data.specProgress) {
          setSpecProgress(data.specProgress);
        }
      } catch (e) {
        console.error("Spec poll error:", e);
      }
    };

    pollSpec();
    const interval = setInterval(pollSpec, 5000);
    return () => clearInterval(interval);
  }, [id, shift?.status]);

  const handleReconcile = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/shifts/${id}/reconcile`), { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // Refresh shift
        const shiftRes = await fetch(apiUrl(`/api/shifts/${id}`));
        const shiftData = await shiftRes.json();
        if (shiftData.success) setShift(shiftData.data);
      }
    } catch (e) {
      console.error("Reconcile error:", e);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="py-20 text-center text-slate-500">
        Shift not found
      </div>
    );
  }

  const isActive = shift.status === "active";
  const isPaused = shift.status === "paused";
  const isCompleted = shift.status === "completed";
  const startDate = new Date(shift.startedAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/shifts">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Shifts
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {shift.technician.firstName} {shift.technician.lastName}&apos;s Shift
            </h1>
            <p className="text-sm text-slate-500">
              {startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {shift.totalDurationMin && ` · ${Math.floor(shift.totalDurationMin / 60)}h ${shift.totalDurationMin % 60}m`}
            </p>
          </div>
        </div>

        {/* Shift controls */}
        <div className="flex items-center gap-2">
          {(isActive || isPaused) && (
            <Button variant="destructive" size="sm" disabled={actionLoading} onClick={handleReconcile}>
              <Square className="h-4 w-4 mr-1" />
              End & Reconcile
            </Button>
          )}
          {isCompleted && (
            <a href={apiUrl(`/api/shifts/${id}/export`)} download>
              <Button variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-1" />
                Export
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Status + Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Gauge className="h-4 w-4" />
              Status
            </div>
            <p className="text-lg font-semibold mt-1 capitalize">{shift.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CheckCircle2 className="h-4 w-4" />
              Measurements
            </div>
            <p className="text-lg font-semibold mt-1">{shift._count.measurements}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Mic className="h-4 w-4" />
              Audio Chunks
            </div>
            <p className="text-lg font-semibold mt-1">{shift._count.captureSessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              Duration
            </div>
            <p className="text-lg font-semibold mt-1">
              {shift.totalDurationMin
                ? `${Math.floor(shift.totalDurationMin / 60)}h ${shift.totalDurationMin % 60}m`
                : "In progress"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content: Feed + Spec progress */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Measurement feed (2/3 width) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Measurement Feed
                {isActive && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MeasurementFeed shiftId={id} isActive={isActive} />
            </CardContent>
          </Card>
        </div>

        {/* Spec progress (1/3 width) */}
        <div>
          {specProgress ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spec Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <SpecProgress {...specProgress} />
              </CardContent>
            </Card>
          ) : shift.measurementSpec ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spec: {shift.measurementSpec.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">Loading progress...</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-400">
                No measurement spec linked to this shift
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
