// POST /api/mobile/evidence/upload-callback — Vercel Blob upload completion callback
// Vercel Blob requires a callback URL when generating client tokens.
// The actual evidence registration is done by the mobile app calling POST /api/mobile/evidence.

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Just acknowledge — the mobile app handles evidence registration separately
  const body = await request.json();
  console.log("Blob upload callback:", JSON.stringify(body).slice(0, 200));
  return NextResponse.json({ received: true });
}
