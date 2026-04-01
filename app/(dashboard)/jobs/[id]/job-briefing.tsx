"use client";

// Job Briefing screen — shown once before an inspector starts working.
// Confirms: CMM template info, WO#, glasses/mic status.
// After "Begin Inspection" is tapped, the workspace takes over and this screen
// never shows again (progress records > 0 means inspection has started).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardList,
  Layers,
  Calendar,
  WifiOff,
  Mic,
  ShieldCheck,
  Glasses,
} from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { QRPairingDialog } from "@/components/qr-pairing-dialog";
import { MentraGlassesPanel } from "@/components/inspect/glasses-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  session: {
    id: string;
    workOrderRef: string | null;
    cmmRevisionAcknowledgedAt: string | null;
    pairingCode: string | null;
    pairingCodeExpiresAt: string | null;
    inspectionTemplate: {
      id: string;
      title: string;
      revisionDate: string | null;
      version: number;
      sections: Array<{
        id: string;
        title: string;
        items: Array<{ id: string }>;
      }>;
    } | null;
  };
  component: {
    partNumber: string;
    serialNumber: string;
    description: string;
  } | null;
}

export default function JobBriefing({ session, component }: Props) {
  const router = useRouter();
  const template = session.inspectionTemplate;

  // WO# — editable before starting
  const [workOrderRef, setWorkOrderRef] = useState(session.workOrderRef || "");

  // CMM revision acknowledgement — already acknowledged sessions skip this
  const alreadyAcknowledged = !!session.cmmRevisionAcknowledgedAt;
  const [cmmAcknowledged, setCmmAcknowledged] = useState(alreadyAcknowledged);

  // Loading + error state for the begin button
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);

  // QR pairing dialog
  const [showPairing, setShowPairing] = useState(false);
  const [showMentra, setShowMentra] = useState(false);
  const [glassesPaired, setGlassesPaired] = useState(
    !session.pairingCode && !!session.pairingCodeExpiresAt
  );

  // Count totals from template
  const sectionCount = template?.sections.length || 0;
  const itemCount =
    template?.sections.reduce((sum, s) => sum + s.items.length, 0) || 0;

  // Format the revision date for display
  const revisionDate = template?.revisionDate
    ? new Date(template.revisionDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown";

  async function handleBeginInspection() {
    setStarting(true);
    setStartError(false);
    try {
      // Save WO#, CMM acknowledgement, and set status in one PATCH
      const trimmedWo = workOrderRef.trim();
      const updates: Record<string, unknown> = { status: "inspecting" };
      if (trimmedWo && trimmedWo !== session.workOrderRef) {
        updates.workOrderRef = trimmedWo;
      }
      if (!alreadyAcknowledged) {
        updates.cmmRevisionAcknowledged = true;
      }

      const res = await fetch(apiUrl(`/api/inspect/sessions/${session.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }

      // Reload the page — the server component will see progress=0 but
      // we'll pass a query param to skip the briefing
      router.push(`/jobs/${session.id}?started=true`);
      router.refresh();
    } catch (error) {
      console.error("[JobBriefing] Failed to begin inspection:", error);
      setStarting(false);
      setStartError(true);
    }
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white/50">
        No CMM template linked to this job.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Job Briefing</h1>
          <p className="text-white/50 text-sm">
            Review the details below before starting your inspection.
          </p>
        </div>

        {/* Component info */}
        {component && (
          <Card className="bg-zinc-900 border-white/10">
            <CardContent className="pt-4 pb-4 space-y-1">
              <p className="text-white font-medium">{component.description}</p>
              <p className="text-white/60 text-sm">
                P/N {component.partNumber} · S/N {component.serialNumber}
              </p>
            </CardContent>
          </Card>
        )}

        {/* CMM Template info */}
        <Card className="bg-zinc-900 border-white/10">
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="flex items-start gap-3">
              <ClipboardList className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-white font-medium">{template.title}</p>
                <p className="text-white/50 text-sm">
                  Rev. {template.version}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{revisionDate}</span>
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <Layers className="h-4 w-4 shrink-0" />
                <span>
                  {sectionCount} section{sectionCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span>
                  {itemCount} item{itemCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CMM Revision Acknowledgement */}
        <Card className="bg-zinc-900 border-white/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0" />
              <p className="text-white font-medium">
                CMM Rev. {template.version} — {revisionDate}
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer mt-3">
              <Checkbox
                checked={cmmAcknowledged}
                onCheckedChange={(checked) => setCmmAcknowledged(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-white/70">
                I confirm this is the latest CMM revision for this component
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Work Order # */}
        <Card className="bg-zinc-900 border-white/10">
          <CardContent className="pt-4 pb-4">
            <label className="block text-sm text-white/70 mb-2">
              Work Order # (optional)
            </label>
            <Input
              value={workOrderRef}
              onChange={(e) => setWorkOrderRef(e.target.value)}
              placeholder="e.g., WO#359847"
              className="bg-zinc-800 border-white/10 text-white placeholder:text-white/30"
            />
          </CardContent>
        </Card>

        {/* Device status — glasses + mic */}
        <Card className="bg-zinc-900 border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-white/70 mb-3">Device Status</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {glassesPaired ? (
                  <div className="flex items-center gap-2">
                    <Glasses className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm text-emerald-400">
                      Glasses: Connected
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 text-white/40" />
                    <span className="text-sm text-white/40">
                      Glasses: Not Connected
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-green-400">Mic: Ready</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowMentra(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                >
                  <Glasses className="h-4 w-4" />
                  {glassesPaired ? "Manage Mentra" : "Mentra Mini"}
                </Button>
                {!glassesPaired && (
                  <Button
                    onClick={() => setShowPairing(true)}
                    variant="outline"
                    size="sm"
                    className="gap-2 border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
                  >
                    Meta / QR
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showMentra} onOpenChange={setShowMentra}>
          <DialogContent className="sm:max-w-lg border-white/10 bg-zinc-950 text-white">
            <DialogHeader>
              <DialogTitle>Connect Mentra Glasses</DialogTitle>
            </DialogHeader>
            <MentraGlassesPanel
              sessionId={session.id}
              onPaired={() => setGlassesPaired(true)}
            />
          </DialogContent>
        </Dialog>

        {/* QR pairing dialog */}
        <QRPairingDialog
          sessionId={session.id}
          open={showPairing}
          onOpenChange={setShowPairing}
          onPaired={() => setGlassesPaired(true)}
        />

        {/* Error message if begin fails */}
        {startError && (
          <p className="text-center text-red-400 text-sm">
            Couldn&apos;t start. Check your connection and try again.
          </p>
        )}

        {/* Begin Inspection button */}
        <Button
          onClick={handleBeginInspection}
          disabled={starting || !cmmAcknowledged}
          className="w-full h-14 text-lg font-semibold bg-blue-600 hover:bg-blue-500 text-white"
          size="lg"
        >
          {starting ? "Starting…" : "Begin Inspection"}
        </Button>
      </div>
    </div>
  );
}
