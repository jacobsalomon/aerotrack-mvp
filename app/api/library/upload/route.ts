// POST /api/library/upload — Generate a client upload token for Vercel Blob.
// This lets the browser upload large PDFs directly to Blob storage,
// bypassing the 4.5MB serverless body size limit.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Verify the user is authenticated before allowing upload
        const session = await auth();
        if (!session?.user?.id || !session.user.organizationId) {
          throw new Error("Not authenticated");
        }

        // Only allow PDF uploads to the cmm-library path
        if (!pathname.startsWith("cmm-library/")) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            organizationId: session.user.organizationId,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Nothing to do here — the client will call POST /api/library
        // with the blob URL after upload completes
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
