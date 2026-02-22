"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
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
      const res = await fetch(apiUrl(`/api/components?${params}`));
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Parts Fleet Overview</h1>
        <p className="text-sm mt-2" style={{ color: 'rgb(100, 100, 100)' }}>
          Track every component across the ecosystem
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Package className="h-6 w-6 mb-1" style={{ color: 'rgb(60, 60, 60)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{components.length}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Total Parts Tracked</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <CheckCircle2 className="h-6 w-6 mb-1" style={{ color: 'rgb(34, 197, 94)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{statusCounts["serviceable"] || 0}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Serviceable</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Wrench className="h-6 w-6 mb-1" style={{ color: 'rgb(202, 138, 4)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{statusCounts["in-repair"] || 0}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>In Repair</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <AlertTriangle className="h-6 w-6 mb-1" style={{ color: 'rgb(234, 88, 12)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{openAlerts}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Open Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <XCircle className="h-6 w-6 mb-1" style={{ color: 'rgb(220, 38, 38)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{criticalAlerts}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Critical Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Parts table (3 columns) */}
        <div className="lg:col-span-3">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Components</CardTitle>
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
                <p className="text-center py-8" style={{ color: 'rgb(120, 120, 120)' }}>Loading components...</p>
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
                      <TableRow key={comp.id} className="cursor-pointer hover:bg-slate-50/50">
                        <TableCell>
                          <Link
                            href={`/parts/${comp.id}`}
                            className="font-mono font-medium hover:underline"
                            style={{ color: 'rgb(60, 60, 60)' }}
                          >
                            {comp.partNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm" style={{ color: 'rgb(80, 80, 80)' }}>
                          {comp.serialNumber}
                        </TableCell>
                        <TableCell style={{ color: 'rgb(60, 60, 60)' }}>{comp.description}</TableCell>
                        <TableCell>
                          <StatusBadge status={comp.status} />
                          {comp.alerts.some((a) => a.severity === "critical") && (
                            <SeverityBadge severity="critical" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm" style={{ color: 'rgb(80, 80, 80)' }}>
                          {comp.totalHours.toLocaleString()}h / {comp.totalCycles.toLocaleString()}c
                        </TableCell>
                        <TableCell className="text-sm" style={{ color: 'rgb(100, 100, 100)' }}>
                          {comp.currentOperator || comp.currentLocation || "—"}
                        </TableCell>
                        <TableCell className="text-sm" style={{ color: 'rgb(60, 60, 60)' }}>{comp._count.events}</TableCell>
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
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Status Breakdown</CardTitle>
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
