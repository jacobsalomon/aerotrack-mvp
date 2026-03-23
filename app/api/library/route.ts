// GET  /api/library — List all CMM inspection templates for the user's org
// POST /api/library — Create a template from an already-uploaded Blob URL

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
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
    // Client uploads the PDF directly to Vercel Blob, then sends us the URL + metadata
    const body = await request.json();
    const { blobUrl, fileName, title, revisionDate, partNumbers, inspectionPages } = body as {
      blobUrl: string;
      fileName: string;
      title?: string;
      revisionDate?: string | null;
      partNumbers?: string | null;
      inspectionPages?: string | null;
    };

    if (!blobUrl || !fileName) {
      return NextResponse.json({ error: "Missing blobUrl or fileName" }, { status: 400 });
    }

    const orgId = session.user.organizationId;
    const docTitle = title?.trim() || fileName.replace(/\.pdf$/i, "");

    // Parse part numbers from comma-separated string
    const partNumbersCovered = partNumbers
      ? partNumbers.split(",").map((pn: string) => pn.trim()).filter(Boolean)
      : [];

    // Parse revision date
    const parsedRevisionDate = revisionDate ? new Date(revisionDate) : null;

    // Parse inspection page ranges
    const parsedInspectionPages = inspectionPages?.trim()
      ? parsePageRanges(inspectionPages)
      : [];

    // Download the PDF from Blob to count pages
    const pdfResponse = await fetch(blobUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: "Could not read uploaded PDF" }, { status: 400 });
    }
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    const totalPages = await getPdfPageCount(pdfBytes);

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
        sourceFileUrl: blobUrl,
        sourceFileName: fileName,
        revisionDate: parsedRevisionDate,
        partNumbersCovered,
        status: "pending_extraction",
        totalPages,
        inspectionPages: parsedInspectionPages,
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
          fileName,
        },
      },
    });

    // Extraction is triggered by the cron job (/api/library/retry-stuck)
    // which runs every minute and picks up pending templates. No after(),
    // no fire-and-forget — the cron calls the extract endpoint directly.

    return NextResponse.json({ success: true, template });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Library] Upload error:", message);
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
