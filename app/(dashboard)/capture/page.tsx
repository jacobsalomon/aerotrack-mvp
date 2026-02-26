"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ScanLine,
  Camera,
  CameraOff,
  Keyboard,
  Loader2,
  FileCheck,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import CameraViewfinder from "@/components/camera-viewfinder";

// Shape of the data extracted from a scanned document by the AI
interface ExtractedDocData {
  documentType: string;
  formNumber: string | null;
  partNumber: string | null;
  serialNumber: string | null;
  description: string | null;
  manufacturer: string | null;
  dateIssued: string | null;
  facility: string | null;
  status: string | null;
  certificateNumber: string | null;
  remarks: string | null;
  confidence: "high" | "medium" | "low";
}

export default function CapturePage() {
  const router = useRouter();

  // ── Manual lookup state (unchanged) ──
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

  // ── RecordSnap state ──
  // capturedImage holds the data-URL for displaying the photo preview
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  // Raw base64 string (no data-URL prefix) for sending to the API
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);
  // MIME type of the captured image (jpeg, png, etc.)
  const [capturedMimeType, setCapturedMimeType] = useState<string>("image/jpeg");
  // True while the AI is processing the image
  const [extracting, setExtracting] = useState(false);
  // The structured data returned by the extraction API
  const [extractedData, setExtractedData] = useState<ExtractedDocData | null>(null);
  // Error message if extraction fails
  const [extractError, setExtractError] = useState("");

  // Hidden file input — fallback for when camera API is unavailable
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live camera viewfinder state
  const [cameraOpen, setCameraOpen] = useState(false);

  // ── Manual lookup handler (unchanged) ──
  async function handleLookup() {
    if (!serialInput.trim()) return;
    setSearching(true);
    setLookupError("");
    setLookupResult(null);

    try {
      const res = await fetch(apiUrl(`/api/components?search=${encodeURIComponent(serialInput.trim())}`));
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const json = await res.json();
      const data = json.data ?? json;

      if (data.length > 0) {
        setLookupResult(data[0]);
      } else {
        setLookupError("No component found. Check the serial number or part number and try again.");
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  // ── RecordSnap: handle image selection from camera or file picker ──
  function handleImageCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear any previous results so the UI starts fresh
    setExtractedData(null);
    setExtractError("");
    setLookupResult(null);
    setLookupError("");

    // Read the file as a base64 data URL, then split off the raw base64
    // for sending to the API (Claude's vision API needs raw base64, not
    // the full data-URL string)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string; // "data:image/jpeg;base64,/9j/..."
      setCapturedImage(dataUrl); // for the <img> preview
      setCapturedMimeType(file.type || "image/jpeg");

      // Strip the "data:image/jpeg;base64," prefix to get raw base64
      const base64 = dataUrl.split(",")[1];
      setCapturedImageBase64(base64);

      // Immediately start the AI extraction
      extractDocument(base64, file.type || "image/jpeg");
    };
    reader.readAsDataURL(file);

    // Reset the input so selecting the same file again still triggers onChange
    e.target.value = "";
  }

  // ── RecordSnap: send the image to Claude for structured data extraction ──
  async function extractDocument(imageBase64: string, mimeType: string) {
    setExtracting(true);
    setExtractError("");
    setExtractedData(null);

    try {
      const res = await fetch(apiUrl("/api/ai/extract-document"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      if (!res.ok) throw new Error("Extraction failed");

      const data = await res.json();
      setExtractedData(data);

      // Auto-search the database for the extracted P/N or S/N so the
      // "Component Found" card appears automatically
      if (data.partNumber || data.serialNumber) {
        const searchTerm = data.partNumber || data.serialNumber;
        const lookupRes = await fetch(
          apiUrl(`/api/components?search=${encodeURIComponent(searchTerm)}`)
        );
        const lookupData = await lookupRes.json();

        if (lookupData.length > 0) {
          setLookupResult(lookupData[0]);
        }
        // If no component matches, we don't show an error — the extracted
        // data is still valuable on its own
      }
    } catch {
      setExtractError("Failed to extract document data. Please try again or use manual entry.");
    }

    setExtracting(false);
  }

  // ── RecordSnap: handle capture from the live camera viewfinder ──
  function handleCameraCapture(data: { dataUrl: string; base64: string; mimeType: string }) {
    setCameraOpen(false);
    setCapturedImage(data.dataUrl);
    setCapturedImageBase64(data.base64);
    setCapturedMimeType(data.mimeType);
    setExtractedData(null);
    setExtractError("");
    setLookupResult(null);
    setLookupError("");
    extractDocument(data.base64, data.mimeType);
  }

  // ── Open the camera: prefer live viewfinder, fall back to file input ──
  function openCamera() {
    // Check if getUserMedia is available (live camera with zoom).
    // In insecure contexts or very old browsers, mediaDevices may not exist.
    const hasGetUserMedia = typeof navigator.mediaDevices?.getUserMedia === "function";
    if (hasGetUserMedia) {
      setCameraOpen(true);
    } else {
      // Fall back to native file input (no zoom, but works everywhere)
      fileInputRef.current?.click();
    }
  }

  // ── RecordSnap: reset everything so the user can scan again ──
  function clearCapture() {
    setCapturedImage(null);
    setCapturedImageBase64(null);
    setExtractedData(null);
    setExtractError("");
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Live camera viewfinder with zoom — opens as a fullscreen overlay */}
      {cameraOpen && (
        <CameraViewfinder
          onCapture={handleCameraCapture}
          onClose={() => setCameraOpen(false)}
          facingMode="environment"
        />
      )}

      {/* Hidden file input — fallback for when getUserMedia is unavailable */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        className="hidden"
        onChange={handleImageCapture}
      />

      {/* ITAR Restricted Mode Banner */}
      {restrictedMode && (
        <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-lg mb-4 text-sm font-medium flex items-center gap-2">
          <CameraOff className="h-4 w-4" />
          RESTRICTED MODE — Camera disabled for ITAR compliance
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AeroVision Capture</h1>
          <p className="text-sm text-slate-500 mt-1">
            Scan a document or enter a part number to begin
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
            {/* ── LEFT COLUMN: RecordSnap (camera/scan area) ── */}
            {!restrictedMode && (
              <div className="space-y-3">
                {/* State 1: No image captured — show the scan button */}
                {!capturedImage && !extracting && (
                  <button
                    onClick={openCamera}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100 hover:border-blue-400 transition-colors cursor-pointer w-full"
                  >
                    <Camera className="h-12 w-12 text-blue-500 mb-3" />
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      Scan a Document
                    </p>
                    <p className="text-xs text-slate-400">
                      Take a photo of any 8130-3, data plate, or maintenance record
                    </p>
                  </button>
                )}

                {/* State 2: Image captured, AI is extracting data */}
                {capturedImage && extracting && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL from camera capture */}
                      <img
                        src={capturedImage}
                        alt="Captured document"
                        className="w-full rounded-t-lg opacity-50"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 rounded-t-lg">
                        <Loader2 className="h-10 w-10 text-white animate-spin mb-2" />
                        <p className="text-white text-sm font-medium">
                          Extracting data...
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* State 3: Extraction complete — show image + extracted fields */}
                {capturedImage && !extracting && (
                  <div className="border rounded-lg overflow-hidden">
                    {/* Photo preview with a close button */}
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL from camera capture */}
                      <img
                        src={capturedImage}
                        alt="Captured document"
                        className="w-full rounded-t-lg"
                      />
                      <button
                        onClick={clearCapture}
                        className="absolute top-2 right-2 bg-white/90 rounded-full p-1 hover:bg-white shadow-sm"
                      >
                        <X className="h-4 w-4 text-slate-600" />
                      </button>
                    </div>

                    {/* Extracted data card — appears below the photo */}
                    {extractedData && (
                      <div className="p-3 space-y-2 bg-green-50/50">
                        {/* Header row: "Data Extracted" + confidence badge */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <FileCheck className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">
                              Data Extracted
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              extractedData.confidence === "high"
                                ? "bg-green-100 text-green-800"
                                : extractedData.confidence === "medium"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }
                          >
                            {extractedData.confidence} confidence
                          </Badge>
                        </div>

                        <Separator />

                        {/* Structured fields in a 2-column grid */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {extractedData.documentType && (
                            <div>
                              <p className="text-xs text-slate-500">Document Type</p>
                              <p className="font-medium">{extractedData.documentType}</p>
                            </div>
                          )}
                          {extractedData.partNumber && (
                            <div>
                              <p className="text-xs text-slate-500">Part Number</p>
                              <p className="font-mono font-medium">
                                {extractedData.partNumber}
                              </p>
                            </div>
                          )}
                          {extractedData.serialNumber && (
                            <div>
                              <p className="text-xs text-slate-500">Serial Number</p>
                              <p className="font-mono font-medium">
                                {extractedData.serialNumber}
                              </p>
                            </div>
                          )}
                          {extractedData.description && (
                            <div className="col-span-2">
                              <p className="text-xs text-slate-500">Description</p>
                              <p className="font-medium">{extractedData.description}</p>
                            </div>
                          )}
                          {extractedData.manufacturer && (
                            <div>
                              <p className="text-xs text-slate-500">Manufacturer</p>
                              <p>{extractedData.manufacturer}</p>
                            </div>
                          )}
                          {extractedData.dateIssued && (
                            <div>
                              <p className="text-xs text-slate-500">Date</p>
                              <p>{extractedData.dateIssued}</p>
                            </div>
                          )}
                          {extractedData.status && (
                            <div>
                              <p className="text-xs text-slate-500">Status</p>
                              <Badge
                                variant="outline"
                                className="bg-blue-100 text-blue-800"
                              >
                                {extractedData.status}
                              </Badge>
                            </div>
                          )}
                          {extractedData.facility && (
                            <div>
                              <p className="text-xs text-slate-500">Facility</p>
                              <p>{extractedData.facility}</p>
                            </div>
                          )}
                        </div>

                        {/* Remarks section (if the document had notes/findings) */}
                        {extractedData.remarks && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-xs text-slate-500">Remarks</p>
                              <p className="text-xs text-slate-700 line-clamp-3">
                                {extractedData.remarks}
                              </p>
                            </div>
                          </>
                        )}

                        {/* Button to scan a different document */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 mt-1"
                          onClick={() => {
                            clearCapture();
                            setTimeout(() => openCamera(), 100);
                          }}
                        >
                          <Camera className="h-3.5 w-3.5" /> Scan Another Document
                        </Button>
                      </div>
                    )}

                    {/* Error state — extraction failed */}
                    {extractError && (
                      <div className="p-3 bg-red-50">
                        <div className="flex items-center gap-1.5 text-red-700 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          {extractError}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 gap-1.5"
                          onClick={() => {
                            if (capturedImageBase64) {
                              extractDocument(capturedImageBase64, capturedMimeType);
                            }
                          }}
                        >
                          Try Again
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── RIGHT COLUMN: Manual entry (unchanged) ── */}
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

      {/* Auto-match indicator when RecordSnap found the component */}
      {lookupResult && extractedData && (
        <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>Component automatically matched from scanned document</span>
        </div>
      )}

      {/* Lookup result — works for both scan and manual entry */}
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
