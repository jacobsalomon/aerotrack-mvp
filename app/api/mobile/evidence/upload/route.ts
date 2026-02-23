// POST /api/mobile/evidence/upload — Generate a signed upload token for Vercel Blob
// The mobile app calls this to get a token, then uploads the file directly to Vercel Blob.
// This bypasses the 4.5MB serverless function body size limit.
// Protected by API key authentication

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { authenticateRequest } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

// Build the callback URL for Vercel Blob upload completion
// Must include the basePath since this project runs under /aerovision-demo
function getCallbackUrl(request: Request): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  // Try origin from the request headers first
  const origin = request.headers.get("origin");
  if (origin) {
    return `${origin}${basePath}/api/mobile/evidence/upload-callback`;
  }
  // In production, use the Vercel production URL
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) {
    const protocol = vercelUrl.includes("localhost") ? "http" : "https";
    return `${protocol}://${vercelUrl}${basePath}/api/mobile/evidence/upload-callback`;
  }
  // Fallback for local dev
  return `http://localhost:3000${basePath}/api/mobile/evidence/upload-callback`;
}

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
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      onUploadCompleted: {
        // No callback needed — the mobile app will register the evidence separately
        // Build a proper callback URL including the basePath (/aerovision-demo)
        callbackUrl: getCallbackUrl(request),
      },
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
