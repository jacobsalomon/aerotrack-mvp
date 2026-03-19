// POST /api/mobile/evidence/upload-callback — Vercel Blob upload completion callback
// This route exists as a safety net in case onUploadCompleted is re-enabled in the future.
// Currently, we don't use onUploadCompleted (removed to fix upload failures).
// The actual evidence registration is done by the mobile app calling POST /api/mobile/evidence.
//
// NOTE: No authentication here — Vercel's servers call this endpoint directly
// and won't have the mobile app's auth token.

import { NextResponse } from "next/server";

export async function POST() {
  // Just acknowledge — the mobile app handles evidence registration separately
  return NextResponse.json({ received: true });
}
