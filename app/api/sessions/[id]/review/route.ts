// POST /api/sessions/[id]/review — Approve or reject a generated document
// Updates DocumentGeneration2 status, creates AuditLogEntry,
// and auto-updates parent session status when all documents are reviewed

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import {
  parseDocumentReviewState,
  serializeDocumentReviewState,
} from "@/lib/document-review-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id: sessionId } = await params;

  // Validate request body
  let body: { documentId: string; action: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { documentId, action, notes } = body;

  if (!documentId || !action) {
    return NextResponse.json(
      { error: "documentId and action are required" },
      { status: 400 }
    );
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 }
    );
  }

  // Verify session exists
  const session = await prisma.captureSession.findUnique({
    where: { id: sessionId },
    select: { id: true, organizationId: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Verify document belongs to this session
  const doc = await prisma.documentGeneration2.findFirst({
    where: { id: documentId, sessionId },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found in this session" },
      { status: 404 }
    );
  }

  const reviewState = parseDocumentReviewState(doc.reviewNotes);

  // Update the document status
  const newStatus = action === "approve" ? "approved" : "rejected";
  const updatedDoc = await prisma.documentGeneration2.update({
    where: { id: documentId },
    data: {
      status: newStatus,
      reviewedAt: new Date(),
      reviewNotes: serializeDocumentReviewState({
        ...reviewState,
        rejectionNote: action === "reject" ? notes || null : null,
      }),
    },
  });

  // Create audit log entry
  await prisma.auditLogEntry.create({
    data: {
      organizationId: session.organizationId,
      action: action === "approve" ? "document_approved" : "document_rejected",
      entityType: "DocumentGeneration2",
      entityId: documentId,
      metadata: JSON.stringify({
        sessionId,
        documentType: doc.documentType,
        notes: notes || null,
      }),
    },
  });

  // Check if all documents in the session are now reviewed
  // and auto-update session status accordingly
  const allDocs = await prisma.documentGeneration2.findMany({
    where: { sessionId },
    select: { status: true },
  });

  const allReviewed = allDocs.every(
    (d) => d.status === "approved" || d.status === "rejected"
  );

  if (allReviewed && allDocs.length > 0) {
    const anyRejected = allDocs.some((d) => d.status === "rejected");
    await prisma.captureSession.update({
      where: { id: sessionId },
      data: { status: anyRejected ? "rejected" : "approved" },
    });
  }

  return NextResponse.json(updatedDoc);
}
