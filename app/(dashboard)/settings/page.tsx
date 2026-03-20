"use client";

// Settings page — edit organization agent instructions in markdown.
// These instructions get injected into all AI prompts (transcription, correction,
// measurement extraction, document generation) to customize behavior per org.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Eye, Pencil, Settings } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import ReactMarkdown from "react-markdown";

const PLACEHOLDER = `## Transcription
# What equipment does your shop work on? What terminology should the AI recognize?

## Measurements
# What precision standards does your shop follow? (e.g., "all dimensional measurements to 0.01 inches")

## Documents
# Any preferences for FAA form generation? Common form types? Regulatory specifics?`;

export default function SettingsPage() {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // Load existing instructions on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl("/api/org/settings"));
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setInstructions(data.agentInstructions || "");
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/org/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentInstructions: instructions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [instructions]);

  return (
    <div>
      <div className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}
        >
          Settings
        </h1>
        <p className="mt-2 text-sm" style={{ color: "rgb(100, 100, 100)" }}>
          Customize how AeroVision&apos;s AI works for your organization.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" style={{ color: "rgb(100, 100, 100)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "rgb(20, 20, 20)" }}>
                Agent Instructions
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Edit / Preview toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
                disabled={loading}
              >
                {mode === "edit" ? (
                  <>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Preview
                  </>
                ) : (
                  <>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </>
                )}
              </Button>
              {/* Save button */}
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={saving || loading}
                style={{ backgroundColor: "rgb(20, 20, 20)", color: "white" }}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                {saved ? "Saved" : "Save"}
              </Button>
            </div>
          </div>

          <p className="mb-4 text-xs" style={{ color: "rgb(130, 130, 130)" }}>
            Write instructions in markdown. These are injected into every AI step — transcription
            correction, measurement extraction, and document generation. Use section headers
            (## Transcription, ## Measurements, ## Documents) so the AI knows which instructions
            apply where.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "rgb(160, 160, 160)" }} />
            </div>
          ) : mode === "edit" ? (
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={PLACEHOLDER}
              className="w-full rounded-lg border p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2"
              style={{
                minHeight: "400px",
                borderColor: "rgb(220, 220, 220)",
                color: "rgb(30, 30, 30)",
                backgroundColor: "rgb(252, 252, 252)",
                resize: "vertical",
              }}
            />
          ) : (
            <div
              className="prose prose-sm max-w-none rounded-lg border p-4"
              style={{
                minHeight: "400px",
                borderColor: "rgb(220, 220, 220)",
                backgroundColor: "rgb(252, 252, 252)",
              }}
            >
              {instructions.trim() ? (
                <ReactMarkdown>{instructions}</ReactMarkdown>
              ) : (
                <p style={{ color: "rgb(160, 160, 160)" }}>
                  No instructions set. Switch to Edit mode to add some.
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              className="mt-3 rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "rgba(239, 68, 68, 0.3)",
                backgroundColor: "rgb(254, 242, 242)",
                color: "rgb(185, 28, 28)",
              }}
            >
              {error}
            </div>
          )}

          {saved && (
            <div
              className="mt-3 rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "rgba(34, 197, 94, 0.3)",
                backgroundColor: "rgb(240, 253, 244)",
                color: "rgb(21, 128, 61)",
              }}
            >
              Instructions saved. Changes will apply to the next capture session.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
