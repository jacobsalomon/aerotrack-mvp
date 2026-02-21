"use client";

// Technicians management page — lists all technicians in the organization
// Shows their status, role, session counts, and API key info

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
import { apiUrl } from "@/lib/api-url";
import { Users, Shield, Wrench, Loader2 } from "lucide-react";

interface TechnicianData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  badgeNumber: string;
  role: string;
  status: string;
  apiKey: string | null;
  createdAt: string;
  organization: { name: string };
  _count: { captureSessions: number; reviewedDocuments: number };
}

const ROLE_BADGES: Record<string, string> = {
  TECHNICIAN: "bg-blue-100 text-blue-700",
  SUPERVISOR: "bg-purple-100 text-purple-700",
  ADMIN: "bg-amber-100 text-amber-700",
};

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<TechnicianData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTechnicians();
  }, []);

  async function fetchTechnicians() {
    try {
      const res = await fetch(apiUrl("/api/technicians"));
      const data = await res.json();
      setTechnicians(data);
    } catch (err) {
      console.error("Failed to fetch technicians:", err);
    } finally {
      setLoading(false);
    }
  }

  const totalTechs = technicians.length;
  const activeTechs = technicians.filter((t) => t.status === "ACTIVE").length;
  const supervisors = technicians.filter((t) => t.role === "SUPERVISOR" || t.role === "ADMIN").length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>Technicians</h1>
        <p className="text-sm mt-2" style={{ color: 'rgb(100, 100, 100)' }}>
          Manage technicians and their mobile app access
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Users className="h-6 w-6 mb-1" style={{ color: 'rgb(60, 60, 60)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{totalTechs}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Total Technicians</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Wrench className="h-6 w-6 mb-1" style={{ color: 'rgb(34, 197, 94)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{activeTechs}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-2">
              <Shield className="h-6 w-6 mb-1" style={{ color: 'rgb(147, 51, 234)' }} />
              <p className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>{supervisors}</p>
              <p className="text-xs font-medium" style={{ color: 'rgb(120, 120, 120)' }}>Supervisors</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: 'rgb(20, 20, 20)' }}>All Technicians</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead className="text-center">Sessions</TableHead>
                  <TableHead className="text-center">Reviews</TableHead>
                  <TableHead>API Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((tech) => (
                  <TableRow key={tech.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {tech.firstName} {tech.lastName}
                        </p>
                        <p className="text-xs text-slate-400">{tech.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                        {tech.badgeNumber}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          ROLE_BADGES[tech.role] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {tech.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          tech.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {tech.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {tech.organization.name}
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {tech._count.captureSessions}
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {tech._count.reviewedDocuments}
                    </TableCell>
                    <TableCell>
                      {tech.apiKey ? (
                        <code className="text-xs text-slate-400">
                          {tech.apiKey.slice(0, 12)}...
                        </code>
                      ) : (
                        <span className="text-xs text-slate-300">Not set</span>
                      )}
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
