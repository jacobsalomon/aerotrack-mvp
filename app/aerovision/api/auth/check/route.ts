// GET /api/auth/check — lightweight endpoint to verify session cookie is still valid
// Used by PasscodeGate to detect expired cookies before API calls fail with 401

import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export async function GET(request: Request) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;
  return new NextResponse(null, { status: 204 });
}

export async function HEAD(request: Request) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;
  return new NextResponse(null, { status: 204 });
}
