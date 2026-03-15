"use client";

// Shifts dashboard — lists all work shifts with measurement counts
// Shows active shifts prominently, completed shifts below

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import {
  Gauge,
  Clock,
  CheckCircle2,
  Pause,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Play,
} from "lucide-react";

interface ShiftSummary {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalDurationMin: number | null;
  notes: string | null;
  technician: { firstName: string; lastName: string; badgeNumber: string };
  measurementSpec: { id: string; name: string } | null;
  _count: { measurements: number; captureSessions: number };
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  active: Play,
  paused: Pause,
  reconciling: Loader2,
  completed: CheckCircle2,
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  reconciling: "bg-blue-100 text-blue-700",
  completed: "bg-slate-100 text-slate-600",
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/shifts"))
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setShifts(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const activeShifts = shifts.filter((s) => s.status === "active" || s.status === "paused");
  const completedShifts = shifts.filter((s) => s.status === "completed" || s.status === "reconciling");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Work Shifts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live measurement feed from glasses + desk mic
          </p>
        </div>
      </div>

      {/* Active shifts — prominent */}
      {activeShifts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-slate-800">Active Shifts</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {activeShifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} active />
            ))}
          </div>
        </div>
      )}

      {activeShifts.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Gauge className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-slate-500">No active shifts</p>
            <p className="text-sm text-slate-400 mt-1">
              Start a shift from the mobile app or API
            </p>
          </CardContent>
        </Card>
      )}

      {/* Completed shifts */}
      {completedShifts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-slate-800">Completed Shifts</h2>
          <div className="space-y-2">
            {completedShifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftCard({ shift, active }: { shift: ShiftSummary; active?: boolean }) {
  const StatusIcon = STATUS_ICONS[shift.status] || AlertTriangle;
  const statusColor = STATUS_COLORS[shift.status] || "bg-slate-100 text-slate-600";
  const startDate = new Date(shift.startedAt);

  return (
    <Link href={`/shifts/${shift.id}`}>
      <Card className={`transition-shadow hover:shadow-md cursor-pointer ${active ? "border-green-200 bg-green-50/30" : ""}`}>
        <CardContent className="py-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
                  <StatusIcon className="h-3 w-3" />
                  {shift.status}
                </span>
                {shift.measurementSpec && (
                  <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                    {shift.measurementSpec.name}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-slate-800">
                {shift.technician.firstName} {shift.technician.lastName}
                <span className="text-slate-400 ml-1">#{shift.technician.badgeNumber}</span>
              </p>
              <p className="text-xs text-slate-500">
                {startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {shift.totalDurationMin && ` · ${Math.floor(shift.totalDurationMin / 60)}h ${shift.totalDurationMin % 60}m`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-slate-900">
                {shift._count.measurements}
              </p>
              <p className="text-xs text-slate-500">measurements</p>
              <ArrowRight className="h-4 w-4 text-slate-400 mt-2 ml-auto" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
