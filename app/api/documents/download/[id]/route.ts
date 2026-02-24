// GET /api/documents/download/[id]
// Downloads a GeneratedDocument as a PDF.
// Looks up the document by ID, parses its JSON content, then renders
// the appropriate PDF based on docType (8130-3, 337, or 8010-4).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { render8130Pdf, render337Pdf, render8010Pdf } from "@/lib/pdf-renderers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Look up the GeneratedDocument
  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Parse the stored JSON content
  const content = JSON.parse(doc.content);

  // Generate the PDF based on document type
  let pdfBytes: Uint8Array;
  let filename: string;

  switch (doc.docType) {
    case "8130-3":
      pdfBytes = await render8130Pdf(content, doc.hash);
      filename = `8130-3_${content.block3 || doc.id}.pdf`;
      break;
    case "337":
      pdfBytes = await render337Pdf(content, doc.hash);
      filename = `Form337_${doc.id}.pdf`;
      break;
    case "8010-4":
      pdfBytes = await render8010Pdf(content, doc.hash);
      filename = `Form8010-4_${doc.id}.pdf`;
      break;
    default:
      // Fallback: generate a simple text-dump PDF
      pdfBytes = await render337Pdf(content, doc.hash);
      filename = `${doc.docType}_${doc.id}.pdf`;
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
