"use client";

// Session Detail Page — full view of a capture session
// Shows: header, evidence gallery (photos/video/audio with playback),
// AI analysis + transcript, generated documents with approve/reject, audit trail

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/lib/api-url";
import {
  ArrowLeft,
  Camera,
  Video,
  Mic,
  FileText,
  CheckCircle2,
  XCircle,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  Brain,
  Shield,
  Loader2,
  X,
  Image as ImageIcon,
  Plus,
  FileCheck,
  FilePlus2,
  Sparkles,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface VideoAnnotation {
  id: string;
  timestamp: number;
  tag: string;
  description: string;
  confidence: number;
}

interface Evidence {
  id: string;
  type: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  durationSeconds: number | null;
  transcription: string | null;
  aiExtraction: string | null;
  capturedAt: string;
  videoAnnotations: VideoAnnotation[];
}

interface DocumentData {
  id: string;
  documentType: string;
  contentJson: string;
  status: string;
  confidence: number;
  lowConfidenceFields: string;
  generatedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  verificationJson: string | null;
  reviewedBy: { id: string; firstName: string; lastName: string } | null;
}

interface SessionAnalysis {
  actionLog: string;
  partsIdentified: string;
  procedureSteps: string;
  anomalies: string;
  confidence: number;
  modelUsed: string;
  processingTime: number | null;
  costEstimate: number | null;
}

interface SessionDetail {
  id: string;
  status: string;
  description: string | null;
  startedAt: string;
  completedAt: string | null;
  technician: {
    firstName: string;
    lastName: string;
    badgeNumber: string;
    email: string | null;
    role: string;
  };
  organization: { name: string };
  evidence: Evidence[];
  documents: DocumentData[];
  analysis: SessionAnalysis | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  timestamp: string;
  technician: { firstName: string; lastName: string } | null;
}

// ─── Status helpers ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  capturing: "bg-blue-100 text-blue-700",
  capture_complete: "bg-cyan-100 text-cyan-700",
  processing: "bg-amber-100 text-amber-700",
  documents_generated: "bg-emerald-100 text-emerald-700",
  submitted: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  capturing: "Capturing",
  capture_complete: "Capture Complete",
  processing: "Processing",
  documents_generated: "Docs Ready",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
  pending_review: "Pending Review",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  "8130-3": "FAA 8130-3 — Airworthiness Approval Tag",
  "337": "FAA Form 337 — Major Repair and Alteration",
  "8010-4": "FAA 8010-4 — Federal Aviation Administration Complaint",
};

// ─── Helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeParseJson(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return "rgb(34, 197, 94)";
  if (score >= 0.5) return "rgb(202, 138, 4)";
  return "rgb(239, 68, 68)";
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Main Component ────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [reviewingDoc, setReviewingDoc] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);

  // Create document state
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [docDescription, setDocDescription] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}`));
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Fetch audit trail when expanded
  useEffect(() => {
    if (!auditOpen) return;
    async function fetchAudit() {
      try {
        const res = await fetch(apiUrl(`/api/sessions/${sessionId}/audit`));
        if (res.ok) {
          const data = await res.json();
          setAuditEntries(data);
        }
      } catch {
        // Audit trail is optional — don't block the page
      }
    }
    fetchAudit();
  }, [auditOpen, sessionId]);

  // Approve or reject a document
  async function handleReview(documentId: string, action: "approve" | "reject", notes?: string) {
    setReviewingDoc(documentId);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action, notes }),
      });
      if (!res.ok) throw new Error("Review failed");
      // Refresh session data to reflect the update
      await fetchSession();
      setShowRejectDialog(null);
      setRejectNotes("");
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setReviewingDoc(null);
    }
  }

  // Create a document manually by type + optional description
  async function handleCreateDocument() {
    if (!selectedDocType) return;
    setCreatingDoc(true);
    setCreateError(null);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/create-document`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: selectedDocType,
          description: docDescription || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      // Refresh session to show the new document
      await fetchSession();
      setShowCreateDoc(false);
      setSelectedDocType(null);
      setDocDescription("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setCreatingDoc(false);
    }
  }

  // ─── Loading / error states ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "rgb(140, 140, 140)" }} />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="py-12">
        <Link href="/sessions" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "rgb(100, 100, 100)" }}>
          <ArrowLeft className="h-4 w-4" /> Back to Sessions
        </Link>
        <p className="text-center text-sm" style={{ color: "rgb(140, 140, 140)" }}>
          {error || "Session not found"}
        </p>
      </div>
    );
  }

  // Categorize evidence
  const photos = session.evidence.filter((e) => e.type === "PHOTO");
  const videos = session.evidence.filter((e) => e.type === "VIDEO");
  const audioChunks = session.evidence.filter((e) => e.type === "AUDIO_CHUNK");

  // Build full transcript from all audio chunks
  const fullTranscript = audioChunks
    .filter((a) => a.transcription)
    .map((a) => a.transcription)
    .join("\n\n");

  // Parse analysis fields
  const analysis = session.analysis;
  const actionLog = safeParseJson(analysis?.actionLog ?? null) as Array<{ timestamp?: string; action?: string; description?: string }> | null;
  const partsIdentified = safeParseJson(analysis?.partsIdentified ?? null) as string[] | null;
  const procedureSteps = safeParseJson(analysis?.procedureSteps ?? null) as string[] | null;
  const anomalies = safeParseJson(analysis?.anomalies ?? null) as string[] | null;

  return (
    <div>
      {/* Photo lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white" }}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Evidence photo"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Reject notes dialog */}
      {showRejectDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => setShowRejectDialog(null)}
        >
          <div
            className="bg-white rounded-xl p-6 shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-3" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              Reject Document
            </h3>
            <p className="text-sm mb-4" style={{ color: "rgb(100, 100, 100)" }}>
              Add optional notes explaining why this document is being rejected.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Rejection notes (optional)..."
              className="w-full border rounded-lg p-3 text-sm mb-4 resize-none"
              style={{ borderColor: "rgb(220, 220, 220)", minHeight: "100px" }}
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowRejectDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={reviewingDoc === showRejectDialog}
                onClick={() => handleReview(showRejectDialog, "reject", rejectNotes)}
              >
                {reviewingDoc === showRejectDialog ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Reject"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <Link href="/sessions" className="inline-flex items-center gap-1 text-sm mb-6 hover:underline" style={{ color: "rgb(100, 100, 100)" }}>
        <ArrowLeft className="h-4 w-4" /> Back to Sessions
      </Link>

      {/* ═══ HEADER ═══ */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              {session.technician.firstName} {session.technician.lastName}
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgb(100, 100, 100)" }}>
              Badge: {session.technician.badgeNumber} &middot; {session.organization.name}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              STATUS_COLORS[session.status] || "bg-slate-100 text-slate-700"
            }`}
          >
            {session.status === "approved" && <CheckCircle2 className="h-4 w-4" />}
            {session.status === "rejected" && <XCircle className="h-4 w-4" />}
            {STATUS_LABELS[session.status] || session.status}
          </span>
        </div>
        <div className="flex gap-6 mt-4 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatDate(session.startedAt)}
          </span>
          <span>Duration: {formatDuration(session.startedAt, session.completedAt)}</span>
          <span>{session.evidence.length} evidence items</span>
          <span>{session.documents.length} documents</span>
        </div>
        {session.description && (
          <p className="mt-3 text-sm" style={{ color: "rgb(80, 80, 80)" }}>
            {session.description}
          </p>
        )}
      </div>

      {/* ═══ EVIDENCE GALLERY ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <Camera className="h-5 w-5" /> Evidence ({session.evidence.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.evidence.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "rgb(140, 140, 140)" }}>
              No evidence captured in this session
            </p>
          ) : (
            <div className="space-y-6">
              {/* Photos */}
              {photos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "rgb(60, 60, 60)" }}>
                    <ImageIcon className="h-4 w-4" /> Photos ({photos.length})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map((photo) => {
                      const extraction = safeParseJson(photo.aiExtraction) as Record<string, unknown> | null;
                      return (
                        <div key={photo.id} className="space-y-2">
                          <div
                            className="aspect-square rounded-lg overflow-hidden cursor-pointer border hover:opacity-90 transition-opacity"
                            style={{ borderColor: "rgb(230, 230, 230)" }}
                            onClick={() => setLightboxUrl(photo.fileUrl)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.fileUrl}
                              alt="Captured photo"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.parentElement!.innerHTML =
                                  '<div class="flex items-center justify-center h-full" style="background:rgb(245,245,245);color:rgb(160,160,160)"><span class="text-xs">Image unavailable</span></div>';
                              }}
                            />
                          </div>
                          <p className="text-xs" style={{ color: "rgb(140, 140, 140)" }}>
                            {formatDate(photo.capturedAt)} &middot; {formatFileSize(photo.fileSize)}
                          </p>
                          {extraction && (
                            <div className="text-xs p-2 rounded" style={{ backgroundColor: "rgb(248, 248, 248)", color: "rgb(80, 80, 80)" }}>
                              {Object.entries(extraction).slice(0, 5).map(([key, val]) => (
                                <p key={key}>
                                  <span className="font-medium">{key}:</span> {String(val)}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Videos */}
              {videos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "rgb(60, 60, 60)" }}>
                    <Video className="h-4 w-4" /> Videos ({videos.length})
                  </h3>
                  <div className="space-y-4">
                    {videos.map((vid) => (
                      <div key={vid.id} className="border rounded-lg p-4" style={{ borderColor: "rgb(230, 230, 230)" }}>
                        <video
                          controls
                          className="w-full max-h-96 rounded-lg mb-3"
                          style={{ backgroundColor: "rgb(10, 10, 10)" }}
                        >
                          <source src={vid.fileUrl} type={vid.mimeType} />
                          Your browser does not support video playback.
                        </video>
                        <div className="flex gap-4 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                          {vid.durationSeconds && <span>{formatDuration("2000-01-01T00:00:00Z", new Date(Date.parse("2000-01-01T00:00:00Z") + vid.durationSeconds * 1000).toISOString())}</span>}
                          <span>{formatFileSize(vid.fileSize)}</span>
                          <span>{formatDate(vid.capturedAt)}</span>
                        </div>
                        {/* Video annotations */}
                        {vid.videoAnnotations.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold mb-2" style={{ color: "rgb(80, 80, 80)" }}>
                              AI Annotations ({vid.videoAnnotations.length})
                            </p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {vid.videoAnnotations.map((ann) => (
                                <div
                                  key={ann.id}
                                  className="flex items-start gap-2 text-xs p-2 rounded cursor-pointer hover:bg-slate-50"
                                  onClick={() => {
                                    // Find the video element and seek to the annotation timestamp
                                    const videoEl = document.querySelector(`video`) as HTMLVideoElement | null;
                                    if (videoEl) {
                                      videoEl.currentTime = ann.timestamp;
                                      videoEl.play();
                                    }
                                  }}
                                >
                                  <span className="font-mono shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgb(240, 240, 240)", color: "rgb(80, 80, 80)" }}>
                                    {formatTimestamp(ann.timestamp)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "rgb(230, 240, 255)", color: "rgb(50, 100, 180)" }}>
                                    {ann.tag}
                                  </span>
                                  <span style={{ color: "rgb(80, 80, 80)" }}>{ann.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audio */}
              {audioChunks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "rgb(60, 60, 60)" }}>
                    <Mic className="h-4 w-4" /> Audio Chunks ({audioChunks.length})
                  </h3>
                  <div className="space-y-3">
                    {audioChunks.map((audio) => (
                      <div key={audio.id} className="border rounded-lg p-4" style={{ borderColor: "rgb(230, 230, 230)" }}>
                        <audio controls className="w-full mb-2">
                          <source src={audio.fileUrl} type={audio.mimeType} />
                          Your browser does not support audio playback.
                        </audio>
                        <div className="flex gap-4 text-xs mb-2" style={{ color: "rgb(120, 120, 120)" }}>
                          {audio.durationSeconds && <span>{Math.round(audio.durationSeconds)}s</span>}
                          <span>{formatFileSize(audio.fileSize)}</span>
                          <span>{formatDate(audio.capturedAt)}</span>
                        </div>
                        {audio.transcription && (
                          <div className="text-xs p-3 rounded" style={{ backgroundColor: "rgb(248, 248, 248)", color: "rgb(60, 60, 60)" }}>
                            <p className="font-semibold mb-1" style={{ color: "rgb(80, 80, 80)" }}>Transcription:</p>
                            <p className="whitespace-pre-wrap">{audio.transcription}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ AI ANALYSIS ═══ */}
      {analysis && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Brain className="h-5 w-5" /> AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Meta info */}
            <div className="flex flex-wrap gap-4 mb-6 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
              <span className="flex items-center gap-1">
                Confidence:
                <span className="font-bold" style={{ color: confidenceColor(analysis.confidence) }}>
                  {Math.round(analysis.confidence * 100)}%
                </span>
              </span>
              <span>Model: {analysis.modelUsed}</span>
              {analysis.processingTime && <span>Processing: {(analysis.processingTime / 1000).toFixed(1)}s</span>}
              {analysis.costEstimate && <span>Cost: ${analysis.costEstimate.toFixed(3)}</span>}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Parts identified */}
              {partsIdentified && partsIdentified.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2" style={{ color: "rgb(60, 60, 60)" }}>Parts Identified</h4>
                  <div className="flex flex-wrap gap-2">
                    {partsIdentified.map((part, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: "rgb(230, 245, 230)", color: "rgb(30, 100, 30)" }}>
                        {String(part)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Procedure steps */}
              {procedureSteps && procedureSteps.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2" style={{ color: "rgb(60, 60, 60)" }}>Procedure Steps</h4>
                  <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: "rgb(60, 60, 60)" }}>
                    {procedureSteps.map((step, i) => (
                      <li key={i}>{String(step)}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Action log timeline */}
            {actionLog && actionLog.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3" style={{ color: "rgb(60, 60, 60)" }}>Action Log</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {actionLog.map((entry, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs p-2 rounded" style={{ backgroundColor: "rgb(248, 248, 248)" }}>
                      {entry.timestamp && (
                        <span className="font-mono shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgb(235, 235, 235)", color: "rgb(80, 80, 80)" }}>
                          {entry.timestamp}
                        </span>
                      )}
                      <span style={{ color: "rgb(60, 60, 60)" }}>{entry.action || entry.description || JSON.stringify(entry)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anomalies */}
            {anomalies && anomalies.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "rgb(180, 80, 0)" }}>
                  <AlertTriangle className="h-4 w-4" /> Anomalies ({anomalies.length})
                </h4>
                <div className="space-y-2">
                  {anomalies.map((item, i) => (
                    <div key={i} className="text-xs p-3 rounded" style={{ backgroundColor: "rgb(255, 248, 240)", color: "rgb(140, 60, 0)" }}>
                      {String(item)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ FULL TRANSCRIPT ═══ */}
      {fullTranscript && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
              <Mic className="h-5 w-5" /> Full Transcript
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" style={{ color: "rgb(60, 60, 60)" }}>
              {fullTranscript}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ GENERATED DOCUMENTS ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <FileText className="h-5 w-5" /> Generated Documents ({session.documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Create New Document button — always visible */}
          <div className="flex justify-end mb-4">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowCreateDoc(!showCreateDoc)}
            >
              <Plus className="h-3.5 w-3.5" /> Create New Document
            </Button>
          </div>

          {/* Create Document Panel */}
          {showCreateDoc && (
            <div className="border rounded-lg p-4 mb-4" style={{ borderColor: "rgb(220, 220, 220)", backgroundColor: "rgb(252, 252, 252)" }}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "rgb(20, 20, 20)" }}>
                <FilePlus2 className="h-4 w-4" /> Create a New Document
              </h3>
              <p className="text-xs mb-4" style={{ color: "rgb(120, 120, 120)" }}>
                Select a document type and optionally describe what you need. The AI will generate the document using your session evidence.
              </p>

              {/* Document type selection */}
              <div className="space-y-2 mb-4">
                {Object.entries(DOC_TYPE_LABELS).map(([type, label]) => {
                  const descriptions: Record<string, string> = {
                    "8130-3": "Authorized Release Certificate for returning a part to service after maintenance.",
                    "337": "Required when major repairs or alterations have been performed.",
                    "8010-4": "Report malfunctions or defects found during maintenance.",
                  };
                  const isSelected = selectedDocType === type;
                  return (
                    <button
                      key={type}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                      onClick={() => setSelectedDocType(isSelected ? null : type)}
                    >
                      <div className="flex items-center gap-2">
                        <FileCheck className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-gray-400"}`} />
                        <span className="text-sm font-medium" style={{ color: "rgb(20, 20, 20)" }}>{label}</span>
                      </div>
                      <p className="text-xs mt-1 ml-6" style={{ color: "rgb(120, 120, 120)" }}>
                        {descriptions[type]}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Description input */}
              {selectedDocType && (
                <div className="mb-4">
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "rgb(80, 80, 80)" }}>
                    Description (optional)
                  </label>
                  <Textarea
                    placeholder="Describe any specific details for this document... e.g. 'Hydraulic pump overhaul with bearing replacement, all tests passed per CMM 29-10-01'"
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              )}

              {createError && (
                <p className="text-xs text-red-600 mb-3">{createError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setShowCreateDoc(false); setSelectedDocType(null); setDocDescription(""); setCreateError(null); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedDocType || creatingDoc}
                  onClick={handleCreateDocument}
                  className="gap-1.5"
                >
                  {creatingDoc ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Generate Document</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {session.documents.length === 0 && !showCreateDoc ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: "rgb(200, 200, 200)" }} />
              <p className="text-sm font-medium mb-1" style={{ color: "rgb(100, 100, 100)" }}>
                No documents generated yet
              </p>
              <p className="text-xs mb-4" style={{ color: "rgb(160, 160, 160)" }}>
                Create a document manually or retry auto-generation with more evidence.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateDoc(true)}>
                <Plus className="h-3.5 w-3.5" /> Create New Document
              </Button>
            </div>
          ) : session.documents.length === 0 ? null : (
            <div className="space-y-4">
              {session.documents.map((doc) => {
                const isExpanded = expandedDoc === doc.id;
                const contentFields = safeParseJson(doc.contentJson) as Record<string, string> | null;
                const lowFields = safeParseJson(doc.lowConfidenceFields) as string[] | null;
                const verification = safeParseJson(doc.verificationJson) as Record<string, unknown> | null;

                return (
                  <div
                    key={doc.id}
                    className="border rounded-lg overflow-hidden"
                    style={{ borderColor: "rgb(230, 230, 230)" }}
                  >
                    {/* Document header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-slate-400">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "rgb(20, 20, 20)" }}>
                            {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                            <span>
                              Confidence:{" "}
                              <span className="font-bold" style={{ color: confidenceColor(doc.confidence) }}>
                                {Math.round(doc.confidence * 100)}%
                              </span>
                            </span>
                            {lowFields && lowFields.length > 0 && (
                              <span className="flex items-center gap-1" style={{ color: "rgb(202, 138, 4)" }}>
                                <AlertTriangle className="h-3 w-3" />
                                {lowFields.length} low-confidence fields
                              </span>
                            )}
                            <span>{formatDate(doc.generatedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            STATUS_COLORS[doc.status] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {STATUS_LABELS[doc.status] || doc.status}
                        </span>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t px-4 py-4" style={{ borderColor: "rgb(240, 240, 240)" }}>
                        {/* Form fields */}
                        {contentFields && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold mb-3" style={{ color: "rgb(80, 80, 80)" }}>Form Fields</h4>
                            <div className="grid md:grid-cols-2 gap-2">
                              {Object.entries(contentFields).map(([key, val]) => {
                                const isLowConf = lowFields?.includes(key);
                                return (
                                  <div
                                    key={key}
                                    className="flex items-start gap-2 text-xs p-2 rounded"
                                    style={{
                                      backgroundColor: isLowConf ? "rgb(255, 250, 230)" : "rgb(248, 248, 248)",
                                      border: isLowConf ? "1px solid rgb(253, 224, 71)" : "none",
                                    }}
                                  >
                                    <span className="font-medium shrink-0 min-w-24" style={{ color: "rgb(80, 80, 80)" }}>{key}:</span>
                                    <span style={{ color: "rgb(40, 40, 40)" }}>{String(val) || "—"}</span>
                                    {isLowConf && <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: "rgb(202, 138, 4)" }} />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Verification results */}
                        {verification && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "rgb(80, 80, 80)" }}>
                              <Shield className="h-3.5 w-3.5" /> AI Verification
                            </h4>
                            <pre className="text-xs p-3 rounded overflow-x-auto" style={{ backgroundColor: "rgb(248, 248, 248)", color: "rgb(60, 60, 60)" }}>
                              {JSON.stringify(verification, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Review info */}
                        {doc.reviewedAt && (
                          <div className="mb-4 text-xs" style={{ color: "rgb(120, 120, 120)" }}>
                            Reviewed {formatDate(doc.reviewedAt)}
                            {doc.reviewedBy && ` by ${doc.reviewedBy.firstName} ${doc.reviewedBy.lastName}`}
                            {doc.reviewNotes && (
                              <p className="mt-1 p-2 rounded" style={{ backgroundColor: "rgb(255, 245, 245)", color: "rgb(180, 50, 50)" }}>
                                Notes: {doc.reviewNotes}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "rgb(240, 240, 240)" }}>
                          {doc.status !== "approved" && doc.status !== "rejected" && (
                            <>
                              <Button
                                size="sm"
                                disabled={reviewingDoc === doc.id}
                                onClick={() => handleReview(doc.id, "approve")}
                                className="gap-1.5"
                                style={{ backgroundColor: "rgb(34, 197, 94)", color: "white" }}
                              >
                                {reviewingDoc === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowRejectDialog(doc.id)}
                                className="gap-1.5"
                                style={{ color: "rgb(220, 50, 50)", borderColor: "rgb(220, 50, 50)" }}
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </>
                          )}
                          {doc.status === "approved" && (
                            <a
                              href={apiUrl(`/api/capture-documents/download/${doc.id}`)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button size="sm" variant="outline" className="gap-1.5">
                                <Download className="h-4 w-4" />
                                Download PDF
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ AUDIT TRAIL ═══ */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setAuditOpen(!auditOpen)}
        >
          <CardTitle className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-space-grotesk)", color: "rgb(20, 20, 20)" }}>
            <Shield className="h-5 w-5" /> Audit Trail
            {auditOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
          </CardTitle>
        </CardHeader>
        {auditOpen && (
          <CardContent>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "rgb(140, 140, 140)" }}>
                No audit trail entries for this session
              </p>
            ) : (
              <div className="space-y-2">
                {auditEntries.map((entry) => {
                  const meta = safeParseJson(entry.metadata) as Record<string, unknown> | null;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 text-xs p-3 rounded" style={{ backgroundColor: "rgb(248, 248, 248)" }}>
                      <span className="font-mono shrink-0" style={{ color: "rgb(120, 120, 120)" }}>
                        {formatDate(entry.timestamp)}
                      </span>
                      <span className="font-medium" style={{ color: "rgb(40, 40, 40)" }}>
                        {humanizeAction(entry.action)}
                      </span>
                      {entry.technician && (
                        <span style={{ color: "rgb(100, 100, 100)" }}>
                          by {entry.technician.firstName} {entry.technician.lastName}
                        </span>
                      )}
                      {meta && typeof meta.notes === "string" && meta.notes && (
                        <span className="italic" style={{ color: "rgb(140, 140, 140)" }}>
                          — {meta.notes}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
