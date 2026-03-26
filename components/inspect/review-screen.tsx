"use client";

// Inspection review screen
// Summary card, problems at top, section-by-section breakdown, findings, sign-off

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Images,
  Lock,
  Loader2,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import InspectionStatusIndicator from "./inspection-status-indicator";
import PhotoLightbox from "./photo-lightbox";

// Types matching the JSON-serialized data from the server component
interface MeasurementData {
  id: string;
  value: number;
  unit: string;
  inTolerance: boolean | null;
}

interface InspectionItemData {
  id: string;
  parameterName: string;
  itemType: string;
  specValueLow: number | null;
  specValueHigh: number | null;
  checkReference: string | null;
  repairReference: string | null;
}

interface ProgressRecord {
  id: string;
  inspectionItemId: string;
  instanceIndex: number;
  status: string;
  result: string | null;
  measurement: MeasurementData | null;
  inspectionItem: InspectionItemData | null;
  completedBy: { firstName: string | null; name: string | null } | null;
}

interface FindingRecord {
  id: string;
  description: string;
  severity: string;
  status: string;
  createdBy: { firstName: string | null; name: string | null } | null;
}

interface SectionData {
  id: string;
  title: string;
  figureNumber: string;
  items: InspectionItemData[];
}

interface TemplateData {
  id: string;
  title: string;
  revisionDate: string | null;
  sections: SectionData[];
}

interface SessionData {
  id: string;
  startedAt: string;
  signedOffAt: string | null;
  configurationVariant: string | null;
  workOrderRef: string | null;
  user: { firstName: string | null; lastName: string | null; name: string | null } | null;
  signedOffBy: { firstName: string | null; name: string | null } | null;
  inspectionTemplate: TemplateData | null;
  inspectionProgress: ProgressRecord[];
  inspectionFindings: FindingRecord[];
}

interface PhotoData {
  id: string;
  fileUrl: string;
  inspectionItemId: string | null;
  instanceIndex: number | null;
  capturedAt: string;
  inspectionItem: { parameterName: string } | null;
}

interface Props {
  session: SessionData;
  component: { id: string; partNumber: string; serialNumber: string; description: string } | null;
  unassignedCount: number;
  isReconciling?: boolean;
  photoItemIds?: string[];
  photos?: PhotoData[];
}

export default function ReviewScreen({ session, component, unassignedCount, isReconciling, photoItemIds = [], photos = [] }: Props) {
  const router = useRouter();
  const template = session.inspectionTemplate;
  const progress = session.inspectionProgress || [];
  const findings = session.inspectionFindings || [];
  const isSignedOff = !!session.signedOffAt;

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [signingOff, setSigningOff] = useState(false);
  const [showSignOffDialog, setShowSignOffDialog] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [zippingPhotos, setZippingPhotos] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  // Build progress map with composite key (handles multi-instance items)
  const progressMap = new Map<string, ProgressRecord>();
  for (const p of progress) {
    progressMap.set(`${p.inspectionItemId}:${p.instanceIndex ?? 0}`, p);
  }

  // Also build a simple itemId→true lookup for section completion counting
  const itemHasProgress = new Set(progress.map((p) => p.inspectionItemId));

  // Summary counts
  const total = progress.length;
  const done = progress.filter((p) => p.status === "done").length;
  const problem = progress.filter((p) => p.status === "problem").length;
  const skipped = progress.filter((p) => p.status === "skipped").length;

  // Problems: out-of-spec items
  const problemItems = progress.filter((p) => p.status === "problem");

  // Unacknowledged check/repair references
  const checkRefs = progress.filter((p) => {
    const item = p.inspectionItem;
    return (item?.checkReference || item?.repairReference) && p.status === "pending";
  });

  // Visual check items missing photo evidence
  const photoItemIdSet = new Set(photoItemIds);
  const allVisualChecks = (template?.sections || []).flatMap((s) =>
    s.items.filter((i) => i.itemType === "visual_check")
  );
  const missingPhotoItems = allVisualChecks.filter((i) => !photoItemIdSet.has(i.id));

  async function handleSignOff() {
    setSigningOff(true);
    try {
      // First transition to reviewing status
      await fetch(apiUrl(`/api/inspect/sessions/${session.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewing" }),
      });

      const res = await fetch(apiUrl(`/api/inspect/sessions/${session.id}/sign-off`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error("Sign-off error:", err);
    } finally {
      setSigningOff(false);
      setShowSignOffDialog(false);
    }
  }

  // Generate and download inspection report PDF
  async function handleGenerateReport() {
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch(apiUrl(`/api/inspect/sessions/${session.id}/generate-report`), {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to generate report");
      }
      // Get the PDF blob and trigger download
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="?(.+?)"?$/)?.[1]
        || "Inspection_Report.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation error:", err);
      setPdfError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Download all photos as a zip file
  async function handleDownloadPhotos() {
    setZippingPhotos(true);
    setZipError(null);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      if (photos.length === 0) {
        setZipError("No photos to download");
        return;
      }

      let added = 0;
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        try {
          const res = await fetch(photo.fileUrl);
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = photo.fileUrl.split(".").pop()?.split("?")[0] || "jpg";
          let name: string;
          if (photo.inspectionItem) {
            const param = photo.inspectionItem.parameterName?.replace(/[^a-zA-Z0-9]/g, "") || "Item";
            name = `Item_${param}_${i + 1}.${ext}`;
          } else {
            name = `General_${i + 1}.${ext}`;
          }
          zip.file(name, blob);
          added++;
        } catch {
          // Skip failed photo fetches
        }
      }

      if (added === 0) {
        setZipError("Could not download any photos");
        return;
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const wo = session.workOrderRef?.replace(/[^a-zA-Z0-9-]/g, "") || "NoWO";
      const dateStr = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Photos_${wo}_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Photo zip error:", err);
      setZipError(err instanceof Error ? err.message : "Failed to create photo package");
    } finally {
      setZippingPhotos(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 max-w-4xl mx-auto pb-20">
      {/* Back button */}
      <div className="mb-4">
        <Button variant="ghost" onClick={() => router.push(`/jobs/${session.id}`)} className="text-white/50 hover:text-white">
          ← Back to Inspection
        </Button>
      </div>

      {/* Reconciliation in-progress banner (Fix 6) */}
      {isReconciling && (
        <div className="flex items-center gap-2 text-blue-400 text-sm bg-blue-500/10 rounded-lg px-4 py-2 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finalizing AI analysis...
        </div>
      )}

      {/* Summary Card */}
      <Card className="bg-white/5 border-white/10 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Inspection Review
            {isSignedOff && (
              <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 ml-2">
                <Lock className="h-3 w-3 mr-1" /> Signed Off
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {component && (
            <div className="text-white/70 text-sm">
              <p className="font-medium text-white">{component.description}</p>
              <p>P/N: {component.partNumber} · S/N: {component.serialNumber}</p>
            </div>
          )}
          <div className="text-white/50 text-sm space-y-1">
            <p>Template: {template?.title} · Rev. {template?.revisionDate ? new Date(template.revisionDate).toLocaleDateString() : "—"}</p>
            {session.configurationVariant && <p>Configuration: {session.configurationVariant}</p>}
            {session.workOrderRef && <p>Work Order: {session.workOrderRef}</p>}
            <p>Inspector: {session.user?.firstName || session.user?.name || "Unknown"} {session.user?.lastName || ""}</p>
            <p>Started: {new Date(session.startedAt).toLocaleString()}</p>
            {isSignedOff && session.signedOffBy && (
              <p className="text-yellow-400">
                Signed off by {session.signedOffBy.firstName || session.signedOffBy.name} at {new Date(session.signedOffAt!).toLocaleString()}
              </p>
            )}
          </div>

          {/* Completion grid */}
          <div className="grid grid-cols-5 gap-2 pt-2">
            {[
              { label: "Total", value: total, color: "text-white" },
              { label: "Done", value: done, color: "text-green-400" },
              { label: "Problems", value: problem, color: "text-red-400" },
              { label: "Skipped", value: skipped, color: "text-zinc-400" },
              { label: "Findings", value: findings.length, color: "text-amber-400" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
                <p className="text-white/40 text-xs">{stat.label}</p>
              </div>
            ))}
          </div>
          {/* Evidence Audit link */}
          <div className="pt-2 border-t border-white/10">
            <Button
              variant="ghost"
              className="w-full text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
              onClick={() => router.push(`/jobs/${session.id}/audit`)}
            >
              <FileCheck className="h-4 w-4 mr-2" />
              Evidence Provenance Audit
            </Button>
          </div>

          {/* Report download buttons (only after sign-off) */}
          {isSignedOff && (
            <div className="pt-2 border-t border-white/10 space-y-2">
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleGenerateReport}
                disabled={generatingPdf}
              >
                {generatingPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {generatingPdf ? "Generating Report..." : "Generate Report"}
              </Button>
              {pdfError && (
                <div className="text-red-400 text-xs text-center">
                  {pdfError}{" "}
                  <button onClick={handleGenerateReport} className="underline hover:text-red-300">
                    Retry
                  </button>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full border-zinc-700 hover:bg-zinc-800"
                onClick={handleDownloadPhotos}
                disabled={zippingPhotos || photos.length === 0}
              >
                {zippingPhotos ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Images className="h-4 w-4 mr-2" />
                )}
                {zippingPhotos ? "Packaging Photos..." : `Download Photos (${photos.length})`}
              </Button>
              {zipError && (
                <div className="text-red-400 text-xs text-center">
                  {zipError}{" "}
                  <button onClick={handleDownloadPhotos} className="underline hover:text-red-300">
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Problems Section */}
      {(problemItems.length > 0 || findings.length > 0) && (
        <Card className="bg-red-500/5 border-red-500/20 mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-400 text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Problems & Findings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {problemItems.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <InspectionStatusIndicator status="problem" size="sm" />
                <div className="flex-1">
                  <p className="text-white text-sm">{p.inspectionItem?.parameterName}</p>
                  {p.measurement && (
                    <p className="text-red-400 text-xs">
                      Measured: {p.measurement.value} {p.measurement.unit}
                      {p.inspectionItem?.specValueLow != null && (
                        <span className="text-white/40"> (spec: {p.inspectionItem.specValueLow}–{p.inspectionItem.specValueHigh})</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {findings.map((f) => {
              // Auto-detected findings start with "Out-of-spec:" (created by inspection-matching.ts)
              const isAutoDetected = f.description?.startsWith("Out-of-spec:");
              return (
                <div key={f.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm">{f.description}</p>
                      {isAutoDetected && (
                        <Badge variant="outline" className="border-blue-400/50 text-blue-400 text-[10px] px-1.5 py-0">
                          Auto-detected
                        </Badge>
                      )}
                    </div>
                    <p className="text-amber-400 text-xs">
                      {f.severity} · {f.status} · by {f.createdBy?.firstName || f.createdBy?.name}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Unacknowledged CHECK/REPAIR references */}
      {checkRefs.length > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20 mb-4">
          <CardContent className="py-3">
            <p className="text-amber-400 text-sm font-medium mb-2">⚠ Unacknowledged References ({checkRefs.length})</p>
            {checkRefs.map((p) => (
              <p key={p.id} className="text-white/50 text-xs">
                {p.inspectionItem?.parameterName}: {p.inspectionItem?.checkReference || p.inspectionItem?.repairReference}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unassigned measurements warning */}
      {unassignedCount > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20 mb-4">
          <CardContent className="py-3">
            <p className="text-amber-400 text-sm">
              ⚠ {unassignedCount} unassigned measurement{unassignedCount > 1 ? "s" : ""} remaining
            </p>
          </CardContent>
        </Card>
      )}

      {/* Missing photo evidence for visual checks */}
      {missingPhotoItems.length > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20 mb-4">
          <CardContent className="py-3">
            <p className="text-amber-400 text-sm font-medium mb-2 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {missingPhotoItems.length} visual check{missingPhotoItems.length !== 1 ? "s" : ""} missing photo evidence
            </p>
            {missingPhotoItems.map((item) => (
              <p key={item.id} className="text-white/50 text-xs">
                {item.parameterName}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Photo Gallery */}
      {photos.length > 0 && (
        <Card className="bg-white/5 border-white/10 mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" /> Photos
              <span className="text-white/40 text-sm font-normal ml-1">{photos.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxUrl(photo.fileUrl)}
                  className="relative aspect-square rounded-lg overflow-hidden border border-white/10
                    hover:border-white/30 transition-colors group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.fileUrl}
                    alt={photo.inspectionItem?.parameterName || "Photo"}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                    <p className="text-white/80 text-[10px] truncate">
                      {photo.inspectionItem?.parameterName || "General"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* Section-by-section breakdown */}
      <div className="space-y-2 mb-6">
        <h3 className="text-white font-medium mb-3">Section Details</h3>
        {(template?.sections || []).map((section) => {
          const sectionItems = section.items || [];
          const isExpanded = expandedSection === section.id;
          const sectionDone = sectionItems.filter((i) => {
            // Check if any progress record exists for this item (across all instances)
            const p = progressMap.get(`${i.id}:0`);
            return p?.status === "done" || p?.status === "problem" || p?.status === "skipped";
          }).length;

          return (
            <div key={section.id} className="bg-white/5 rounded-lg border border-white/10">
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 text-white/30" /> : <ChevronRight className="h-4 w-4 text-white/30" />}
                <span className="text-white text-sm flex-1">
                  Fig {section.figureNumber} — {section.title}
                </span>
                <span className="text-white/40 text-xs font-mono">{sectionDone}/{sectionItems.length}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 space-y-1">
                  {sectionItems.map((item) => {
                    const p = progressMap.get(`${item.id}:0`);
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2 border-t border-white/5">
                        <InspectionStatusIndicator status={p?.status || "pending"} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white/70 text-sm truncate">{item.parameterName}</p>
                        </div>
                        {p?.measurement && (
                          <span className={cn(
                            "text-xs font-mono",
                            p.measurement.inTolerance === false ? "text-red-400" : "text-green-400"
                          )}>
                            {p.measurement.value} {p.measurement.unit}
                          </span>
                        )}
                        {p?.completedBy && (
                          <span className="text-white/20 text-xs">
                            {p.completedBy.firstName?.[0] || "AI"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sign-off button */}
      {!isSignedOff && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-white/10 p-4 pb-safe">
          <Button
            className="w-full h-14 bg-green-600 hover:bg-green-700 text-lg font-medium"
            onClick={() => setShowSignOffDialog(true)}
          >
            <Check className="h-5 w-5 mr-2" /> Sign Off Inspection
          </Button>
        </div>
      )}

      {/* Sign-off confirmation dialog */}
      {showSignOffDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowSignOffDialog(false)} />
          <div className="relative bg-zinc-900 rounded-xl border border-white/10 p-6 max-w-md mx-4 space-y-4">
            <h3 className="text-white font-medium text-lg">Confirm Sign-Off</h3>
            <p className="text-white/60 text-sm">
              You are signing off on the inspection of{" "}
              {component ? <span className="text-white">{component.partNumber} {component.serialNumber}</span> : "this component"}{" "}
              against <span className="text-white">{template?.title}</span>.
            </p>
            <p className="text-white/60 text-sm">
              {done} items complete, {problem} problems, {findings.length} findings.
            </p>
            <p className="text-amber-400 text-sm font-medium">
              This action is recorded and the record becomes read-only.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-white/20 text-white/70"
                onClick={() => setShowSignOffDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleSignOff}
                disabled={signingOff}
              >
                {signingOff ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign Off"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
