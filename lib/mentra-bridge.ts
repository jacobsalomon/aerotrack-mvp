import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export interface MentraBridgeSession {
  id: string;
  userId: string;
  organizationId: string;
  sessionType: string;
  status: string;
  description: string | null;
  workOrderRef: string | null;
  signedOffAt: Date | null;
  pairingCodeExpiresAt: Date | null;
  inspectionTemplate: { title: string } | null;
}

function getProvidedSecret(request: Request): string | null {
  const headerSecret = request.headers.get("x-mentra-bridge-secret");
  if (headerSecret?.trim()) return headerSecret.trim();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearerSecret = authHeader.slice(7).trim();
    if (bearerSecret) return bearerSecret;
  }

  return null;
}

function secretsMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function requireMentraBridge(request: Request) {
  const expectedSecret = process.env.MENTRA_BRIDGE_SECRET;
  if (!expectedSecret) {
    return {
      error: NextResponse.json(
        { success: false, error: "MENTRA_BRIDGE_SECRET is not configured" },
        { status: 500 }
      ),
    };
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || !secretsMatch(expectedSecret, providedSecret)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Unauthorized bridge request" },
        { status: 401 }
      ),
    };
  }

  return { ok: true as const };
}

export function buildMentraSessionLabel(session: Pick<MentraBridgeSession, "id" | "description" | "workOrderRef" | "inspectionTemplate">): string {
  return (
    session.workOrderRef ||
    session.description ||
    session.inspectionTemplate?.title ||
    `Session ${session.id.slice(0, 8)}`
  );
}

export function isMentraSessionConnectable(session: MentraBridgeSession): boolean {
  if (session.sessionType === "inspection") {
    return !session.signedOffAt && session.status !== "cancelled";
  }

  return ![
    "capture_complete",
    "processing",
    "analysis_complete",
    "documents_generated",
    "verified",
    "submitted",
    "approved",
    "rejected",
    "failed",
  ].includes(session.status);
}

export function isMentraSessionWritable(session: MentraBridgeSession): boolean {
  if (session.sessionType === "inspection") {
    return !session.signedOffAt && session.status !== "cancelled";
  }

  return ![
    "capture_complete",
    "processing",
    "analysis_complete",
    "documents_generated",
    "verified",
    "submitted",
    "approved",
    "rejected",
    "failed",
  ].includes(session.status);
}
