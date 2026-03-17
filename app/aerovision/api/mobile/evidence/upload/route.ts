// POST /api/mobile/evidence/upload — Generate a signed upload token for Vercel Blob
// The mobile app calls this to get a token, then uploads the file directly to Vercel Blob.
// This bypasses the 4.5MB serverless function body size limit.
// Protected by API key authentication
//
// NOTE: We intentionally do NOT use onUploadCompleted callbacks here.
// The mobile app registers evidence metadata separately via POST /api/mobile/evidence.
// Callbacks were causing upload failures because:
//   - Local dev: Vercel can't reach localhost callback URL
//   - Production: Callback route required auth that Vercel's servers don't have
// Without callbacks, the Blob PUT response returns immediately after file upload.

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { pathname, contentType } = body;

    if (!pathname) {
      return NextResponse.json(
        { success: false, error: "pathname is required" },
        { status: 400 }
      );
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Blob storage not configured" },
        { status: 500 }
      );
    }

    // Generate a short-lived client token scoped to the specific upload path
    // No onUploadCompleted — evidence registration is handled by the mobile app
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      allowedContentTypes: contentType
        ? [contentType]
        : [
            "image/jpeg",
            "image/png",
            "image/heic",
            "video/mp4",
            "video/quicktime",
            "audio/m4a",
            "audio/mp4",
            "audio/mpeg",
            "audio/x-m4a",
          ],
      maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
    });

    return NextResponse.json({
      success: true,
      data: { clientToken, uploadUrl: "https://blob.vercel-storage.com" },
    });
  } catch (error) {
    console.error("Upload token error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to generate upload token",
      },
      { status: 500 }
    );
  }
}
