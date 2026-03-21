"use client";

// Team page — lists everyone who uses AeroVision

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/api-url";
import { Users, Loader2 } from "lucide-react";

interface UserData {
  id: string;
  name: string | null;
  email: string | null;
  _count: { captureSessions: number };
}

export default function TeamPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [teamRes, orgRes] = await Promise.all([
          fetch(apiUrl("/api/technicians")),
          fetch(apiUrl("/api/org/settings")),
        ]);
        if (teamRes.ok) setUsers(await teamRes.json());
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          setOrgName(orgData.orgName || "");
        }
      } catch (err) {
        console.error("Failed to fetch team:", err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}
        >
          Team
        </h1>
        <p className="text-sm mt-2" style={{ color: "rgb(100, 100, 100)" }}>
          Everyone who uses AeroVision{orgName ? ` at ${orgName}` : ""}.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-8 w-8 mb-3" style={{ color: "rgb(209, 213, 219)" }} />
              <p className="text-sm" style={{ color: "rgb(107, 114, 128)" }}>
                No team members yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-sm">
                      {user.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm" style={{ color: "rgb(107, 114, 128)" }}>
                      {user.email || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {user._count.captureSessions}
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
