// POST /api/mobile/evidence/upload-callback — Vercel Blob upload completion callback
// Vercel Blob requires a callback URL when generating client tokens.
// The actual evidence registration is done by the mobile app calling POST /api/mobile/evidence.

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  // Require mobile authentication
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  // Just acknowledge — the mobile app handles evidence registration separately
  console.log("Blob upload callback received");
  return NextResponse.json({ received: true });
}
