// GET  /api/org/documents — List all PDFs uploaded by your organization
// POST /api/org/documents — Upload a new PDF for your organization

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// List all documents for the user's org
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const docs = await prisma.orgDocument.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      fileUrl: true,
      fileSizeBytes: true,
      uploadedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ documents: docs });
}

// Upload a new PDF
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Only allow PDFs
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    // 20MB limit
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be under 20MB" }, { status: 400 });
    }

    // Use the file name as title if none provided
    const docTitle = title?.trim() || file.name.replace(/\.pdf$/i, "");

    // Upload to Vercel Blob under org-documents/ prefix
    const blob = await put(
      `org-documents/${session.user.organizationId}/${Date.now()}-${file.name}`,
      file,
      { access: "public", contentType: "application/pdf" }
    );

    // Save metadata to database
    const doc = await prisma.orgDocument.create({
      data: {
        organizationId: session.user.organizationId,
        title: docTitle,
        fileUrl: blob.url,
        fileSizeBytes: file.size,
        uploadedBy: session.user.id,
      },
    });

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    console.error("[Org Documents] Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
