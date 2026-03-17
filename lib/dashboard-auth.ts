// Dashboard authentication helper.
// Verifies signed, expiring session cookies issued by /api/auth/verify-passcode.

import crypto from "crypto";
import { NextResponse } from "next/server";

export const DASHBOARD_AUTH_COOKIE_NAME = "av-session";
export const DASHBOARD_SESSION_TTL_SECONDS = 72 * 60 * 60; // 72 hours

interface DashboardSessionPayload {
  iat: number;
  exp: number;
  nonce: string;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (!entry) continue;

    const separator = entry.indexOf("=");
    if (separator <= 0) continue;

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!key) continue;

    cookies[key] = value;
  }

  return cookies;
}

function getDashboardSessionSecret(): string | null {
  const explicit = process.env.DASHBOARD_SESSION_SECRET?.trim();
  if (explicit) return explicit;

  if (process.env.NODE_ENV !== "production") {
    const passcode = process.env.PASSCODE?.trim();
    if (passcode) return passcode;
    return "development-dashboard-session-secret";
  }

  return null;
}

function signPayload(payloadBase64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function timingSafeEqualStrings(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function decodeDashboardSessionPayload(
  encodedPayload: string
): DashboardSessionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<DashboardSessionPayload>;

    if (
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.nonce !== "string"
    ) {
      return null;
    }

    return {
      iat: parsed.iat,
      exp: parsed.exp,
      nonce: parsed.nonce,
    };
  } catch {
    return null;
  }
}

export function getConfiguredDashboardPasscode(): string | null {
  const configured = process.env.PASSCODE?.trim();
  if (configured) return configured;

  // Keep local development usable, but never allow production fallback.
  if (process.env.NODE_ENV !== "production") return "2206";
  return null;
}

export function createDashboardSessionToken(): string | null {
  const secret = getDashboardSessionSecret();
  if (!secret) return null;

  const nowMs = Date.now();
  const payload: DashboardSessionPayload = {
    iat: nowMs,
    exp: nowMs + DASHBOARD_SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomUUID(),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = signPayload(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

export function verifyDashboardSessionToken(token: string | undefined): boolean {
  if (!token) return false;

  const secret = getDashboardSessionSecret();
  if (!secret) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;
  const payloadBase64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!payloadBase64 || !signature) return false;

  const expectedSignature = signPayload(payloadBase64, secret);
  if (!timingSafeEqualStrings(signature, expectedSignature)) return false;

  const payload = decodeDashboardSessionPayload(payloadBase64);
  if (!payload) return false;

  return payload.exp > Date.now();
}

export function requireDashboardAuth(request: Request): NextResponse | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);

  if (
    !verifyDashboardSessionToken(cookies[DASHBOARD_AUTH_COOKIE_NAME])
  ) {
    return NextResponse.json(
      { error: "Unauthorized — passcode required" },
      { status: 401 }
    );
  }

  return null;
}
