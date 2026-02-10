"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { StatusBadge, SeverityBadge } from "@/components/shared/status-badge";
import {
  Search,
  Package,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  XCircle,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ComponentData {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  oem: string;
  status: string;
  totalHours: number;
  totalCycles: number;
  currentOperator: string | null;
  currentAircraft: string | null;
  currentLocation: string | null;
  _count: { events: number; alerts: number };
  alerts: { severity: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  serviceable: "#22c55e",
  installed: "#3b82f6",
  "in-repair": "#eab308",
  retired: "#6b7280",
  quarantined: "#ef4444",
};

export default function DashboardPage() {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchComponents() {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/components?${params}`);
      const data = await res.json();
      setComponents(data);
      setLoading(false);
    }
    fetchComponents();
  }, [search, statusFilter]);

  // Stats
  const statusCounts = components.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = Object.entries(statusCounts).map(([name, value]) => ({
    name: name.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    value,
    color: STATUS_COLORS[name] || "#6b7280",
  }));

  const openAlerts = components.reduce((sum, c) => sum + c.alerts.length, 0);
  const criticalAlerts = components.reduce(
    (sum, c) => sum + c.alerts.filter((a) => a.severity === "critical").length,
    0
  );

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Parts Fleet Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track every component across the ecosystem
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{components.length}</p>
                <p className="text-xs text-slate-500">Total Parts Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{statusCounts["serviceable"] || 0}</p>
                <p className="text-xs text-slate-500">Serviceable</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wrench className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{statusCounts["in-repair"] || 0}</p>
                <p className="text-xs text-slate-500">In Repair</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{openAlerts}</p>
                <p className="text-xs text-slate-500">Open Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{criticalAlerts}</p>
                <p className="text-xs text-slate-500">Critical Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Parts table (3 columns) */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Components</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search P/N, S/N, operator..."
                      className="pl-9 w-64"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="serviceable">Serviceable</SelectItem>
                      <SelectItem value="installed">Installed</SelectItem>
                      <SelectItem value="in-repair">In Repair</SelectItem>
                      <SelectItem value="quarantined">Quarantined</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center py-8 text-slate-500">Loading components...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Serial Number</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hours / Cycles</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Events</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {components.map((comp) => (
                      <TableRow key={comp.id} className="cursor-pointer hover:bg-slate-50">
                        <TableCell>
                          <Link
                            href={`/parts/${comp.id}`}
                            className="font-mono font-medium text-blue-700 hover:underline"
                          >
                            {comp.partNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {comp.serialNumber}
                        </TableCell>
                        <TableCell>{comp.description}</TableCell>
                        <TableCell>
                          <StatusBadge status={comp.status} />
                          {comp.alerts.some((a) => a.severity === "critical") && (
                            <SeverityBadge severity="critical" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {comp.totalHours.toLocaleString()}h / {comp.totalCycles.toLocaleString()}c
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {comp.currentOperator || comp.currentLocation || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{comp._count.events}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status chart (1 column) */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span>{entry.name}</span>
                    </div>
                    <span className="font-medium">{entry.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
