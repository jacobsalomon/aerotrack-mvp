// POST /api/admin/upload-cmm — Upload a CMM PDF for a part number
// Stores the file in Vercel Blob and creates a ComponentManual record.
// Also accepts reference data entries to create alongside the manual.
// Requires ADMIN role.

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { uploadCmmPdf } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Only admins can upload CMM manuals
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const partNumber = formData.get("partNumber") as string | null;
    const title = formData.get("title") as string | null;
    const pageCount = formData.get("pageCount") as string | null;

    if (!file || !partNumber || !title) {
      return NextResponse.json(
        { success: false, error: "file, partNumber, and title are required" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${partNumber.replace(/[^a-zA-Z0-9-]/g, "_")}_${Date.now()}.pdf`;
    const { url, size } = await uploadCmmPdf(buffer, filename);

    // Create the database record
    const manual = await prisma.componentManual.create({
      data: {
        partNumber,
        title,
        fileUrl: url,
        fileSizeBytes: size,
        pageCount: pageCount ? parseInt(pageCount, 10) : null,
      },
    });

    return NextResponse.json({ success: true, data: manual }, { status: 201 });
  } catch (error) {
    console.error("CMM upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload CMM" },
      { status: 500 }
    );
  }
}

// GET /api/admin/upload-cmm — List all uploaded CMM manuals
export async function GET() {
  try {
    const manuals = await prisma.componentManual.findMany({
      orderBy: { uploadedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: manuals });
  } catch (error) {
    console.error("CMM list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list CMMs" },
      { status: 500 }
    );
  }
}
