// GET /api/sessions/[sessionId]/form-fields
// Returns extracted form fields for the session's org document.
// Caches the result on the OrgDocument so Gemini only runs once per PDF.

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { extractOrgDocumentFields } from "@/lib/ai/org-document-extraction";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { sessionId } = await params;

  // Find the session and its linked org document
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: {
      orgDocument: {
        select: { id: true, fileUrl: true, formFieldsJson: true },
      },
    },
  });

  if (!session || !session.orgDocument) {
    return NextResponse.json(
      { error: "Session has no org document" },
      { status: 404 }
    );
  }

  const doc = session.orgDocument;

  // Return cached result if we already extracted fields
  if (doc.formFieldsJson) {
    try {
      return NextResponse.json(JSON.parse(doc.formFieldsJson));
    } catch {
      // Cache is corrupt — fall through to re-extract
    }
  }

  // Extract fields from the PDF using Gemini vision
  try {
    const extraction = await extractOrgDocumentFields(doc.fileUrl);

    // Cache the result on the OrgDocument so we don't call Gemini again
    const cachePayload = JSON.stringify({
      fields: extraction.fields,
      sections: extraction.sections,
      pageCount: extraction.pageCount,
      documentTitle: extraction.documentTitle,
    });

    await prisma.orgDocument.update({
      where: { id: doc.id },
      data: { formFieldsJson: cachePayload },
    });

    return NextResponse.json({
      fields: extraction.fields,
      sections: extraction.sections,
      pageCount: extraction.pageCount,
      documentTitle: extraction.documentTitle,
    });
  } catch (err) {
    console.error("Form field extraction failed:", err);
    return NextResponse.json(
      { error: "Failed to extract form fields" },
      { status: 500 }
    );
  }
}
