// PATCH /api/sessions/[id]/documents/[docId] — Update individual fields in a generated document
// Merges updated fields into existing contentJson (doesn't replace the whole object)
// Only allows updates on draft/pending_review documents
// Auto-triggers re-verification after save
// Protected by dashboard auth

export const maxDuration = 60;

import { prisma } from "@/lib/db";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { verifyDocuments } from "@/lib/ai/verify";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id: sessionId, docId } = await params;

  let fields: Record<string, string>;
  try {
    const body = await request.json();
    fields = body.fields;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!fields || typeof fields !== "object" || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "fields object is required with at least one field" }, { status: 400 });
  }

  try {
    // Load the document
    const doc = await prisma.documentGeneration2.findUnique({
      where: { id: docId },
      include: { session: { select: { id: true, technicianId: true, organizationId: true } } },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.sessionId !== sessionId) {
      return NextResponse.json({ error: "Document does not belong to this session" }, { status: 400 });
    }

    // Only allow edits on draft or pending_review
    if (doc.status !== "draft" && doc.status !== "pending_review") {
      return NextResponse.json(
        { error: `Cannot edit a document with status "${doc.status}". Only draft or pending_review documents can be edited.` },
        { status: 409 }
      );
    }

    // Parse existing contentJson and merge in updated fields
    let existingContent: Record<string, unknown>;
    try {
      existingContent = JSON.parse(doc.contentJson);
    } catch {
      existingContent = {};
    }

    // Track old values for audit log
    const changes: Record<string, { old: unknown; new: string }> = {};
    for (const [key, newVal] of Object.entries(fields)) {
      changes[key] = { old: existingContent[key] ?? null, new: newVal };
      existingContent[key] = newVal;
    }

    // Save updated contentJson
    const updated = await prisma.documentGeneration2.update({
      where: { id: docId },
      data: {
        contentJson: JSON.stringify(existingContent),
      },
    });

    // Audit log — record which fields were changed
    await prisma.auditLogEntry.create({
      data: {
        organizationId: doc.session.organizationId,
        technicianId: doc.session.technicianId,
        action: "document_fields_edited",
        entityType: "DocumentGeneration2",
        entityId: docId,
        metadata: JSON.stringify({ sessionId, changes }),
      },
    });

    // Auto re-verify (best-effort — don't fail the save if verification breaks)
    let verification = null;
    try {
      const verifyResult = await verifyDocuments(sessionId, doc.session.technicianId);
      verification = verifyResult.verification;
    } catch (verifyError) {
      console.warn(
        "Re-verification after edit failed (non-blocking):",
        verifyError instanceof Error ? verifyError.message : verifyError
      );
    }

    return NextResponse.json({
      id: updated.id,
      documentType: updated.documentType,
      status: updated.status,
      contentJson: existingContent,
      verification,
    });
  } catch (error) {
    console.error("Document field update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document update failed" },
      { status: 500 }
    );
  }
}
