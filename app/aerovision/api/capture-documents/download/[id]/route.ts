// GET /api/capture-documents/download/[id]
// Downloads a DocumentGeneration2 (capture session document) as a PDF.
// Same PDF renderers as the demo documents, but reads from DocumentGeneration2 table.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { render8130Pdf, render337Pdf, render8010Pdf } from "@/lib/pdf-renderers";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id } = await params;

  const doc = await prisma.documentGeneration2.findUnique({
    where: { id },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Parse the stored JSON content
  let content;
  try {
    content = JSON.parse(doc.contentJson);
  } catch {
    return NextResponse.json(
      { error: "Document content is malformed" },
      { status: 500 }
    );
  }

  // Generate PDF based on document type
  let pdfBytes: Uint8Array;
  let filename: string;

  try {
    switch (doc.documentType) {
      case "8130-3":
        pdfBytes = await render8130Pdf(content, undefined);
        filename = `8130-3_${doc.id}.pdf`;
        break;
      case "337":
        pdfBytes = await render337Pdf(content, undefined);
        filename = `Form337_${doc.id}.pdf`;
        break;
      case "8010-4":
        pdfBytes = await render8010Pdf(content, undefined);
        filename = `Form8010-4_${doc.id}.pdf`;
        break;
      default:
        pdfBytes = await render337Pdf(content, undefined);
        filename = `${doc.documentType}_${doc.id}.pdf`;
    }
  } catch (err) {
    console.error("PDF rendering failed:", err);
    return NextResponse.json(
      { error: "Failed to render PDF" },
      { status: 500 }
    );
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    },
  });
}
