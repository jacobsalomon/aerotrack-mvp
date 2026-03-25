// CMM compliance configuration — thresholds for age warnings
// "Stale" CMMs can lead to compliance violations (per SilverWings/industry standard)

// Amber warning: CMM uploaded more than this many days ago
export const CMM_AGE_WARNING_DAYS = 30;

// Red warning: CMM uploaded more than this many days ago
export const CMM_AGE_CRITICAL_DAYS = 90;

// Max instance count for multi-instance items (prevents UI explosion)
export const MAX_INSTANCE_COUNT = 100;

// Composite key for multi-instance progress: "itemId:instanceIndex"
// Used by progressMap in the workspace and item list
export function progressKey(itemId: string, instanceIndex: number): string {
  return `${itemId}:${instanceIndex}`;
}

// Helper: compute age warning level from a date
export function getCmmAgeWarning(uploadedAt: Date | string): "ok" | "warning" | "critical" {
  const now = new Date();
  const uploaded = new Date(uploadedAt);
  const diffMs = now.getTime() - uploaded.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > CMM_AGE_CRITICAL_DAYS) return "critical";
  if (diffDays > CMM_AGE_WARNING_DAYS) return "warning";
  return "ok";
}
