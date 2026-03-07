export const SESSION_STATUS_VALUES = [
  "capturing",
  "capture_complete",
  "processing",
  "analysis_complete",
  "documents_generated",
  "verified",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "failed",
  "cancelled",
] as const;

export type SessionStatus = (typeof SESSION_STATUS_VALUES)[number];

export const MOBILE_SESSION_MUTABLE_STATUS_VALUES = [
  "capturing",
  "capture_complete",
  "processing",
  "analysis_complete",
  "documents_generated",
  "verified",
  "completed",
  "failed",
  "cancelled",
] as const;

export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  capturing: "bg-blue-100 text-blue-700",
  capture_complete: "bg-cyan-100 text-cyan-700",
  processing: "bg-amber-100 text-amber-700",
  analysis_complete: "bg-sky-100 text-sky-700",
  documents_generated: "bg-emerald-100 text-emerald-700",
  verified: "bg-green-100 text-green-700",
  submitted: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  capturing: "Capturing",
  capture_complete: "Capture Complete",
  processing: "Processing",
  analysis_complete: "Analysis Complete",
  documents_generated: "Docs Ready",
  verified: "Verified",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const REVIEW_SESSION_STATUSES: SessionStatus[] = [
  "documents_generated",
  "verified",
  "submitted",
];

export function isMobileMutableSessionStatus(
  value: unknown
): value is (typeof MOBILE_SESSION_MUTABLE_STATUS_VALUES)[number] {
  return (
    typeof value === "string" &&
    (MOBILE_SESSION_MUTABLE_STATUS_VALUES as readonly string[]).includes(value)
  );
}
