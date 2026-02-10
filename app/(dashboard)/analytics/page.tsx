"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Mock analytics data — in production this would come from real queries
const nffData = [
  { partFamily: "881700 Pump", nffRate: 12, fleetAvg: 8 },
  { partFamily: "2548934 Valve", nffRate: 6, fleetAvg: 8 },
  { partFamily: "65075 Actuator", nffRate: 28, fleetAvg: 8 },
  { partFamily: "2670112 Motor", nffRate: 5, fleetAvg: 8 },
];

const reliabilityData = [
  { month: "Jul '24", mtbr: 8200 },
  { month: "Aug '24", mtbr: 8100 },
  { month: "Sep '24", mtbr: 7900 },
  { month: "Oct '24", mtbr: 8400 },
  { month: "Nov '24", mtbr: 8300 },
  { month: "Dec '24", mtbr: 8500 },
  { month: "Jan '25", mtbr: 8600 },
];

const turnaroundData = [
  { facility: "ACE Singapore", days: 12 },
  { facility: "ST Engineering", days: 15 },
  { facility: "AAR Miami", days: 10 },
  { facility: "Delta TechOps", days: 8 },
  { facility: "Lufthansa Technik", days: 18 },
];

const recordQuality = [
  { name: "Digital (structured)", value: 68, color: "#3b82f6" },
  { name: "Scanned PDF", value: 22, color: "#eab308" },
  { name: "Missing/Gap", value: 10, color: "#ef4444" },
];

export default function AnalyticsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Data-driven insights across the Parker parts ecosystem
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NFF Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">&ldquo;No Fault Found&rdquo; Rate by Part Family</CardTitle>
            <p className="text-xs text-slate-500">
              Higher NFF rates indicate potential systemic issues — the 65075 actuator spike was traced to a batch connector defect
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={nffData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="partFamily" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="nffRate" fill="#ef4444" name="NFF Rate %" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fleetAvg" fill="#94a3b8" name="Fleet Avg %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Reliability trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mean Time Between Removals (MTBR)</CardTitle>
            <p className="text-xs text-slate-500">
              HPC-7 Hydraulic Pump (881700 series) — trending upward after SB implementation
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={reliabilityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis unit="h" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="mtbr"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="MTBR (hours)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Turnaround times */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repair Turnaround by Facility</CardTitle>
            <p className="text-xs text-slate-500">
              Average days from receiving to release — AAR Miami leads for HPC-7 series
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={turnaroundData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit=" days" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="facility" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="days" fill="#8b5cf6" name="Avg Days" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Record quality */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Quality Distribution</CardTitle>
            <p className="text-xs text-slate-500">
              68% of lifecycle events have born-digital structured records — AeroTrack aims to push this to 95%+
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={recordQuality}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {recordQuality.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {recordQuality.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm">{entry.name}</span>
                    <span className="text-sm font-bold">{entry.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
