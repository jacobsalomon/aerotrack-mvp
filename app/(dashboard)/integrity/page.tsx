"use client";

// ──────────────────────────────────────────────────────
// Integrity & Compliance Page
//
// This is AeroTrack's "mission control" for data quality.
// It shows two things:
// 1. Alerts — existing manual flags (provenance gaps, counterfeit suspects)
// 2. Exceptions — automated findings from the exception detection engine
//
// The "Run Full Scan" button triggers the engine to analyze every
// component's data for inconsistencies. Think of it like running
// an audit across the entire fleet in seconds.
// ──────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/shared/status-badge";
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Scan,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { apiUrl } from "@/lib/api-url";

// ── Types ────────────────────────────────────────────

interface Alert {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  component: {
    partNumber: string;
    serialNumber: string;
    description: string;
  };
  componentId: string;
}

interface Exception {
  id: string;
  exceptionType: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  status: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  component: {
    partNumber: string;
    serialNumber: string;
    description: string;
  };
  componentId: string;
}

// ── Label Maps ───────────────────────────────────────

const alertTypeLabels: Record<string, string> = {
  provenance_gap: "Provenance Gap",
  counterfeit_suspect: "Counterfeit Suspect",
  overdue_inspection: "Overdue Inspection",
  record_mismatch: "Record Mismatch",
  nff_pattern: "NFF Pattern",
  life_limit_approaching: "Life Limit Approaching",
};

const exceptionTypeLabels: Record<string, string> = {
  serial_number_mismatch: "Serial Number Mismatch",
  part_number_mismatch: "Part Number Mismatch",
  cycle_count_discrepancy: "Cycle Count Discrepancy",
  hour_count_discrepancy: "Hour Count Discrepancy",
  documentation_gap: "Documentation Gap",
  missing_release_certificate: "Missing Release Certificate",
  missing_birth_certificate: "Missing Birth Certificate",
  date_inconsistency: "Date Inconsistency",
  unsigned_document: "Unsigned Document",
  missing_facility_certificate: "Missing Facility Certificate",
};

// ── Component ────────────────────────────────────────

export default function IntegrityPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    totalComponents: number;
    componentsWithExceptions: number;
    totalExceptions: number;
  } | null>(null);

  // Filter state for exceptions
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("all");

  // Fetch both alerts and exceptions on page load
  const fetchData = useCallback(async () => {
    const [alertsRes, exceptionsRes] = await Promise.all([
      fetch(apiUrl("/api/alerts")),
      fetch(apiUrl("/api/exceptions")),
    ]);
    setAlerts(await alertsRes.json());
    setExceptions(await exceptionsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Run the exception engine scan on all components
  async function runFullScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(apiUrl("/api/exceptions/scan-all"), { method: "POST" });
      const result = await res.json();
      setScanResult(result);
      // Refresh exception list after scan
      const exceptionsRes = await fetch(apiUrl("/api/exceptions"));
      setExceptions(await exceptionsRes.json());
    } finally {
      setScanning(false);
    }
  }

  // Auto-scan on first load if no exceptions exist yet
  useEffect(() => {
    if (!loading && exceptions.length === 0) {
      runFullScan();
    }
    // Only run once after initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Update exception status
  async function updateExceptionStatus(
    exceptionId: string,
    status: string
  ) {
    await fetch(apiUrl(`/api/exceptions/${exceptionId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    // Refresh data
    const exceptionsRes = await fetch(apiUrl("/api/exceptions"));
    setExceptions(await exceptionsRes.json());
  }

  // ── Filter exceptions ──────────────────────────────

  const filteredExceptions = exceptions.filter((ex) => {
    if (severityFilter !== "all" && ex.severity !== severityFilter) return false;
    if (statusFilter !== "all" && ex.status !== statusFilter) return false;
    if (typeFilter !== "all" && ex.exceptionType !== typeFilter) return false;
    return true;
  });

  // ── Computed counts ────────────────────────────────

  const openExceptions = exceptions.filter(
    (e) => e.status === "open" || e.status === "investigating"
  );
  const criticalExceptions = openExceptions.filter(
    (e) => e.severity === "critical"
  ).length;
  const warningExceptions = openExceptions.filter(
    (e) => e.severity === "warning"
  ).length;
  const resolvedExceptions = exceptions.filter(
    (e) => e.status === "resolved" || e.status === "false_positive"
  ).length;

  // Also count open alerts for the combined view
  const openAlerts = alerts.filter(
    (a) => a.status !== "resolved" && a.status !== "dismissed"
  );

  return (
    <div>
      {/* Page header with scan button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Integrity & Compliance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automated exception detection, provenance verification, and
            compliance tracking
          </p>
        </div>
        <button
          onClick={runFullScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="h-4 w-4" />
              Run Full Scan
            </>
          )}
        </button>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          Scan complete — {scanResult.totalComponents} components checked,{" "}
          {scanResult.componentsWithExceptions} with exceptions,{" "}
          {scanResult.totalExceptions} total findings.
        </div>
      )}

      {/* Summary cards — exceptions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-slate-600" />
              <div>
                <p className="text-2xl font-bold">{openExceptions.length}</p>
                <p className="text-xs text-slate-500">Open Exceptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={
            criticalExceptions > 0 ? "border-red-200 bg-red-50" : ""
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldX className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-700">
                  {criticalExceptions}
                </p>
                <p className="text-xs text-slate-500">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{warningExceptions}</p>
                <p className="text-xs text-slate-500">Warning</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{resolvedExceptions}</p>
                <p className="text-xs text-slate-500">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="all">All Types</option>
          {Object.entries(exceptionTypeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      {loading || scanning ? (
        <div className="text-center py-8 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          {scanning
            ? "Scanning components for issues..."
            : "Loading data..."}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Exception list */}
          <h2 className="text-lg font-semibold text-slate-700">
            Exceptions ({filteredExceptions.length})
          </h2>

          {filteredExceptions.length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">
              No exceptions match the current filters.
            </p>
          )}

          {filteredExceptions.map((exception) => (
            <Card
              key={exception.id}
              className={`border-l-4 ${
                exception.severity === "critical"
                  ? "border-l-red-500"
                  : exception.severity === "warning"
                  ? "border-l-yellow-500"
                  : "border-l-blue-500"
              } ${
                exception.status === "resolved" ||
                exception.status === "false_positive"
                  ? "opacity-60"
                  : ""
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <SeverityBadge severity={exception.severity} />
                      <Badge variant="outline" className="text-xs">
                        {exceptionTypeLabels[exception.exceptionType] ||
                          exception.exceptionType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          exception.status === "resolved"
                            ? "bg-green-50 text-green-700"
                            : exception.status === "investigating"
                            ? "bg-purple-50 text-purple-700"
                            : exception.status === "false_positive"
                            ? "bg-gray-50 text-gray-500"
                            : ""
                        }`}
                      >
                        {exception.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm mt-1">
                      {exception.title}
                    </h3>
                    <Link
                      href={`/parts/${exception.componentId}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {exception.component.partNumber} (
                      {exception.component.serialNumber}) —{" "}
                      {exception.component.description}
                    </Link>
                    <p className="text-sm text-slate-600 mt-2">
                      {exception.description}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Detected:{" "}
                      {new Date(exception.detectedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Action buttons */}
                  {exception.status === "open" && (
                    <div className="flex gap-1 ml-4 shrink-0">
                      <button
                        onClick={() =>
                          updateExceptionStatus(exception.id, "investigating")
                        }
                        className="p-1.5 text-purple-600 hover:bg-purple-50 rounded"
                        title="Investigate"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          updateExceptionStatus(exception.id, "resolved")
                        }
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                        title="Resolve"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          updateExceptionStatus(exception.id, "false_positive")
                        }
                        className="p-1.5 text-gray-400 hover:bg-gray-50 rounded"
                        title="False Positive"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {exception.status === "investigating" && (
                    <div className="flex gap-1 ml-4 shrink-0">
                      <button
                        onClick={() =>
                          updateExceptionStatus(exception.id, "resolved")
                        }
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                        title="Resolve"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          updateExceptionStatus(exception.id, "false_positive")
                        }
                        className="p-1.5 text-gray-400 hover:bg-gray-50 rounded"
                        title="False Positive"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Existing alerts section */}
          {openAlerts.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-slate-700 mt-8">
                Alerts ({openAlerts.length})
              </h2>
              {openAlerts.map((alert) => (
                <Card
                  key={alert.id}
                  className={`border-l-4 ${
                    alert.severity === "critical"
                      ? "border-l-red-500"
                      : alert.severity === "warning"
                      ? "border-l-yellow-500"
                      : "border-l-blue-500"
                  }`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <SeverityBadge severity={alert.severity} />
                          <Badge variant="outline" className="text-xs">
                            {alertTypeLabels[alert.alertType] ||
                              alert.alertType}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {alert.status}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-sm mt-1">
                          {alert.title}
                        </h3>
                        <Link
                          href={`/parts/${alert.componentId}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {alert.component.partNumber} (
                          {alert.component.serialNumber}) —{" "}
                          {alert.component.description}
                        </Link>
                        <p className="text-sm text-slate-600 mt-2">
                          {alert.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
