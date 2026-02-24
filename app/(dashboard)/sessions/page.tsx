"use client";

// Capture Sessions dashboard — lists all mobile capture sessions
// Shows session status, technician, evidence count, document count
// Supervisors can review and approve generated documents here

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/api-url";
import {
  Smartphone,
  Camera,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface SessionData {
  id: string;
  status: string;
  description: string | null;
  startedAt: string;
  completedAt: string | null;
  technician: {
    id: string;
    firstName: string;
    lastName: string;
    badgeNumber: string;
  };
  organization: { name: string };
  _count: { evidence: number; documents: number };
}

const STATUS_COLORS: Record<string, string> = {
  capturing: "bg-blue-100 text-blue-700",
  processing: "bg-amber-100 text-amber-700",
  documents_generated: "bg-emerald-100 text-emerald-700",
  submitted: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  capturing: "Capturing",
  processing: "Processing",
  documents_generated: "Docs Ready",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      try {
        const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
        const res = await fetch(apiUrl(`/api/sessions${params}`));
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [statusFilter]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDuration(start: string, end: string | null): string {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  // Summary stats
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter(
    (s) => s.status === "capturing" || s.status === "processing"
  ).length;
  const pendingReview = sessions.filter(
    (s) => s.status === "documents_generated" || s.status === "submitted"
  ).length;
  const totalEvidence = sessions.reduce((sum, s) => sum + s._count.evidence, 0);

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Capture Sessions</h1>
        <p className="text-sm mt-2" style={{ color: 'rgb(100, 100, 100)' }}>
          Mobile capture sessions from technicians using AeroVision Capture
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Smartphone className="h-6 w-6 mb-1" style={{ color: 'rgb(60, 60, 60)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{totalSessions}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Total Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Loader2 className="h-6 w-6 mb-1" style={{ color: 'rgb(202, 138, 4)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{activeSessions}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Active Now</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <FileText className="h-6 w-6 mb-1" style={{ color: 'rgb(147, 51, 234)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{pendingReview}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Camera className="h-6 w-6 mb-1" style={{ color: 'rgb(34, 197, 94)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{totalEvidence}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Evidence Items</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter + table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>All Sessions</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="capturing">Capturing</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="documents_generated">Docs Ready</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'rgb(140, 140, 140)' }}>
              <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No capture sessions yet</p>
              <p className="text-xs mt-1">
                Sessions appear here when technicians use the AeroVision Capture app
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-center">Evidence</TableHead>
                  <TableHead className="text-center">Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[session.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {session.status === "approved" && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {session.status === "rejected" && (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {(session.status === "capturing" || session.status === "processing") && (
                          <Clock className="h-3 w-3" />
                        )}
                        {STATUS_LABELS[session.status] || session.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {session.technician.firstName} {session.technician.lastName}
                        </p>
                        <p className="text-xs text-slate-400">
                          {session.technician.badgeNumber}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDate(session.startedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDuration(session.startedAt, session.completedAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium">
                        {session._count.evidence}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium">
                        {session._count.documents}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
