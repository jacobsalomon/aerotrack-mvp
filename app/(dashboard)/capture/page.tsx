"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScanLine, Camera, CameraOff, Keyboard } from "lucide-react";

export default function CapturePage() {
  const router = useRouter();
  const [serialInput, setSerialInput] = useState("");
  const [restrictedMode, setRestrictedMode] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    id: string;
    partNumber: string;
    serialNumber: string;
    description: string;
    status: string;
    totalHours: number;
    totalCycles: number;
    currentOperator: string | null;
  } | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [searching, setSearching] = useState(false);

  async function handleLookup() {
    if (!serialInput.trim()) return;
    setSearching(true);
    setLookupError("");
    setLookupResult(null);

    const res = await fetch(`/api/components?search=${encodeURIComponent(serialInput.trim())}`);
    const data = await res.json();

    if (data.length > 0) {
      setLookupResult(data[0]);
    } else {
      setLookupError("No component found. Check the serial number or part number and try again.");
    }
    setSearching(false);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* ITAR Restricted Mode Banner */}
      {restrictedMode && (
        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-lg mb-4 text-sm font-medium flex items-center gap-2">
          <CameraOff className="h-4 w-4" />
          RESTRICTED MODE — Camera disabled for ITAR compliance
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AeroTrack Capture</h1>
          <p className="text-sm text-slate-500 mt-1">
            Scan a part to begin the maintenance capture workflow
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="restricted-mode" className="text-sm text-slate-500">
            Restricted Mode
          </Label>
          <Switch
            id="restricted-mode"
            checked={restrictedMode}
            onCheckedChange={setRestrictedMode}
          />
        </div>
      </div>

      {/* Scan / Manual entry */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            Identify Component
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Camera scanner placeholder */}
            {!restrictedMode && (
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50">
                <Camera className="h-12 w-12 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-1">Point camera at barcode or data plate</p>
                <p className="text-xs text-slate-400">QR code scanning available in tablet mode</p>
              </div>
            )}

            {/* Manual entry */}
            <div className={!restrictedMode ? "" : "md:col-span-2"}>
              <div className="flex items-center gap-2 mb-3">
                <Keyboard className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-medium">Manual Entry</p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter S/N or P/N (e.g. 881700-1089)"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                />
                <Button onClick={handleLookup} disabled={searching}>
                  {searching ? "Searching..." : "Look Up"}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Try: 881700-1089 (in repair), 881700-1001 (perfect history), or SN-2017-04190 (counterfeit)
              </p>
            </div>
          </div>

          {lookupError && (
            <p className="text-sm text-red-600 mt-4">{lookupError}</p>
          )}
        </CardContent>
      </Card>

      {/* Lookup result */}
      {lookupResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Component Found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <p className="text-slate-500">Part Number</p>
                <p className="font-mono font-medium">{lookupResult.partNumber}</p>
              </div>
              <div>
                <p className="text-slate-500">Serial Number</p>
                <p className="font-mono font-medium">{lookupResult.serialNumber}</p>
              </div>
              <div>
                <p className="text-slate-500">Description</p>
                <p>{lookupResult.description}</p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <Badge
                  variant="outline"
                  className={
                    lookupResult.status === "in-repair"
                      ? "bg-yellow-100 text-yellow-800"
                      : lookupResult.status === "quarantined"
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }
                >
                  {lookupResult.status}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
              <span>{lookupResult.totalHours.toLocaleString()} hours</span>
              <span>{lookupResult.totalCycles.toLocaleString()} cycles</span>
              {lookupResult.currentOperator && (
                <span>Operator: {lookupResult.currentOperator}</span>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={() => router.push(`/capture/work/${lookupResult.id}`)}>
                Begin Overhaul Capture
              </Button>
              <Button variant="outline" onClick={() => router.push(`/parts/${lookupResult.id}`)}>
                View Full History
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
