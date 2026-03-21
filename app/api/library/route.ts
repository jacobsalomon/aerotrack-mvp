// GET  /api/library — List all CMM inspection templates for the user's org
// POST /api/library — Upload a new CMM PDF and start extraction

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { parsePageRanges, getPdfPageCount } from "@/lib/pdf-utils";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const templates = await prisma.inspectionTemplate.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { sections: true } },
    },
  });

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const revisionDateStr = formData.get("revisionDate") as string | null;
    const partNumbersStr = formData.get("partNumbers") as string | null;
    const inspectionPagesStr = formData.get("inspectionPages") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    // 50MB limit for CMMs (they can be large)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be under 50MB" }, { status: 400 });
    }

    const orgId = session.user.organizationId;
    const docTitle = title?.trim() || file.name.replace(/\.pdf$/i, "");

    // Parse part numbers from comma-separated string
    const partNumbersCovered = partNumbersStr
      ? partNumbersStr.split(",").map((pn) => pn.trim()).filter(Boolean)
      : [];

    // Parse revision date
    const revisionDate = revisionDateStr ? new Date(revisionDateStr) : null;

    // Parse inspection page ranges (user provides 1-based, we store 0-based internally)
    const inspectionPages = inspectionPagesStr?.trim()
      ? parsePageRanges(inspectionPagesStr)
      : [];

    // Get page count from the PDF
    const pdfBytes = Buffer.from(await file.arrayBuffer());
    const totalPages = await getPdfPageCount(pdfBytes);

    // Upload to Vercel Blob
    const blob = await put(
      `cmm-library/${orgId}/${Date.now()}-${file.name}`,
      file,
      { access: "public", contentType: "application/pdf" }
    );

    // Check for existing ComponentManual records with matching part numbers
    let componentManualId: string | null = null;
    if (partNumbersCovered.length > 0) {
      const existingManual = await prisma.componentManual.findFirst({
        where: { partNumber: { in: partNumbersCovered } },
        select: { id: true },
      });
      componentManualId = existingManual?.id ?? null;
    }

    // Archive any existing active templates for the same part numbers
    if (partNumbersCovered.length > 0) {
      await prisma.inspectionTemplate.updateMany({
        where: {
          organizationId: orgId,
          status: "active",
          partNumbersCovered: { hasSome: partNumbersCovered },
        },
        data: { status: "archived" },
      });
    }

    // Create the template record
    const template = await prisma.inspectionTemplate.create({
      data: {
        organizationId: orgId,
        createdById: session.user.id,
        componentManualId,
        title: docTitle,
        sourceFileUrl: blob.url,
        sourceFileName: file.name,
        revisionDate,
        partNumbersCovered,
        status: "pending_extraction",
        totalPages,
        inspectionPages,
        version: 1,
      },
    });

    // Audit log
    await prisma.auditLogEntry.create({
      data: {
        organizationId: orgId,
        userId: session.user.id,
        action: "cmm_uploaded",
        entityType: "InspectionTemplate",
        entityId: template.id,
        metadata: {
          title: docTitle,
          partNumbers: partNumbersCovered,
          totalPages,
          fileName: file.name,
        },
      },
    });

    // Kick off extraction by calling the extraction endpoint
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    // Fire-and-forget: trigger extraction asynchronously
    fetch(`${baseUrl}${basePath}/api/library/${template.id}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch((err) => {
      console.error("[Library] Failed to trigger extraction:", err);
    });

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error("[Library] Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
