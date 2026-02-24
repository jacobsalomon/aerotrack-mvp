"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, User } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

interface KnowledgeEntry {
  id: string;
  partFamily: string;
  topic: string;
  expertName: string;
  expertYears: number;
  expertCert: string | null;
  description: string;
  tags: string;
  cmmReference: string | null;
  createdAt: string;
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce search to avoid firing a fetch on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      async function fetchEntries() {
        setLoading(true);
        setError("");
        try {
          const params = search ? `?search=${encodeURIComponent(search)}` : "";
          const res = await fetch(apiUrl(`/api/knowledge${params}`));
          if (!res.ok) throw new Error(`Failed to load (${res.status})`);
          setEntries(await res.json());
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load knowledge entries");
        } finally {
          setLoading(false);
        }
      }
      fetchEntries();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Knowledge Library</h1>
        <p className="text-sm text-slate-500 mt-1">
          Captured expertise from experienced mechanics — tribal knowledge preserved
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder='Search by topic, part family, or expert — e.g. "corrosion HPC-7"'
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center py-8 text-slate-500">Loading knowledge entries...</p>
      ) : entries.length === 0 ? (
        <p className="text-center py-8 text-slate-500">No matching entries found.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{entry.topic}</CardTitle>
                    <p className="text-sm text-slate-500 mt-0.5">{entry.partFamily}</p>
                  </div>
                  {entry.cmmReference && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {entry.cmmReference}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  &ldquo;{entry.description}&rdquo;
                </p>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {entry.expertName} · {entry.expertYears} yrs exp.
                      {entry.expertCert && ` · ${entry.expertCert}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.split(",").map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs"
                      >
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
