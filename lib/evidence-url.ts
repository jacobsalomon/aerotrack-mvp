const DEFAULT_ALLOWED_EVIDENCE_HOSTS = ["blob.vercel-storage.com"];

function getAllowedEvidenceHosts(): string[] {
  const configured = process.env.ALLOWED_EVIDENCE_HOSTS;
  if (!configured) return DEFAULT_ALLOWED_EVIDENCE_HOSTS;

  const hosts = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : DEFAULT_ALLOWED_EVIDENCE_HOSTS;
}

function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  return allowlist.some(
    (allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  );
}

export function isAllowedEvidenceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const hostname = parsed.hostname.toLowerCase();
    return hostMatchesAllowlist(hostname, getAllowedEvidenceHosts());
  } catch {
    return false;
  }
}

export function getAllowedEvidenceHostsForError(): string {
  return getAllowedEvidenceHosts().join(", ");
}
