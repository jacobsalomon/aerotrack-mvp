// PATCH /api/sessions/[id]/documents/[docId] — Update individual fields in a generated document
// Merges updated fields into existing contentJson (doesn't replace the whole object)
// Only allows updates on draft/pending_review documents
// Auto-triggers re-verification after save
// Protected by dashboard auth

export const maxDuration = 60;

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/rbac";
import { getValueAtPath, setValueAtPath } from "@/lib/document-field-layout";
import {
  type FieldDispositionStatus,
  parseDocumentReviewState,
  serializeDocumentReviewState,
} from "@/lib/document-review-state";
import { verifyDocuments } from "@/lib/ai/verify";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id: sessionId, docId } = await params;

  let fields: Record<string, string> | null = null;
  let fieldDisposition:
    | {
        fieldKey: string;
        status: FieldDispositionStatus | null;
        rationale?: string | null;
      }
    | null = null;
  try {
    const body = await request.json();
    if (body.fields && typeof body.fields === "object") {
      fields = body.fields as Record<string, string>;
    }
    if (body.fieldDisposition && typeof body.fieldDisposition === "object") {
      fieldDisposition = body.fieldDisposition as {
        fieldKey: string;
        status: FieldDispositionStatus | null;
        rationale?: string | null;
      };
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const hasFieldEdits = !!fields && Object.keys(fields).length > 0;
  const hasDispositionUpdate = !!fieldDisposition;

  if (!hasFieldEdits && !hasDispositionUpdate) {
    return NextResponse.json(
      { error: "Provide either fields or fieldDisposition updates." },
      { status: 400 }
    );
  }

  if (fieldDisposition) {
    if (!fieldDisposition.fieldKey || typeof fieldDisposition.fieldKey !== "string") {
      return NextResponse.json({ error: "fieldDisposition.fieldKey is required" }, { status: 400 });
    }

    if (
      fieldDisposition.status !== null &&
      fieldDisposition.status !== "manually_verified" &&
      fieldDisposition.status !== "accepted_with_rationale" &&
      fieldDisposition.status !== "needs_additional_evidence"
    ) {
      return NextResponse.json({ error: "Invalid fieldDisposition.status" }, { status: 400 });
    }

    const requiresRationale =
      fieldDisposition.status === "accepted_with_rationale" ||
      fieldDisposition.status === "needs_additional_evidence";
    if (requiresRationale && !(fieldDisposition.rationale || "").trim()) {
      return NextResponse.json(
        { error: "A rationale is required for this certifier disposition." },
        { status: 400 }
      );
    }
  }

  try {
    // Load the document
    const doc = await prisma.captureDocument.findUnique({
      where: { id: docId },
      include: { session: { select: { id: true, userId: true, organizationId: true } } },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Cross-org isolation: verify the document's session belongs to the authenticated user's org
    if (!authResult.user.organizationId) {
      return NextResponse.json({ error: "No organization assigned" }, { status: 403 });
    }
    if (doc.session.organizationId !== authResult.user.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    // contentJson is already a parsed object (Prisma Json type)
    const existingContent: Record<string, unknown> =
      (doc.contentJson && typeof doc.contentJson === "object" && !Array.isArray(doc.contentJson))
        ? (doc.contentJson as Record<string, unknown>)
        : {};

    const reviewState = parseDocumentReviewState(doc.reviewNotes);

    // Track old values for audit log and edit history
    const changes: Record<string, { old: unknown; new: string }> = {};
    if (fields) {
      for (const [key, newVal] of Object.entries(fields)) {
        changes[key] = { old: getValueAtPath(existingContent, key) ?? null, new: newVal };
        setValueAtPath(existingContent, key, newVal);
      }

      // Persist edit history in contentJson._editHistory so the UI can show "Edited" badges
      const editHistory: Array<Record<string, unknown>> =
        Array.isArray(existingContent._editHistory)
          ? (existingContent._editHistory as Array<Record<string, unknown>>)
          : [];
      for (const [field, diff] of Object.entries(changes)) {
        editHistory.push({
          field,
          oldValue: diff.old ?? null,
          newValue: diff.new,
          editedAt: new Date().toISOString(),
          editedBy: authResult.user.id,
        });
      }
      existingContent._editHistory = editHistory;
    }

    if (fieldDisposition) {
      if (fieldDisposition.status === null) {
        delete reviewState.fieldDispositions[fieldDisposition.fieldKey];
      } else {
        reviewState.fieldDispositions[fieldDisposition.fieldKey] = {
          status: fieldDisposition.status,
          rationale: fieldDisposition.rationale?.trim() || null,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    const nextReviewNotes = serializeDocumentReviewState(reviewState);

    // Save updated contentJson and/or review state
    const updated = await prisma.captureDocument.update({
      where: { id: docId },
      data: {
        contentJson: existingContent as unknown as Prisma.InputJsonValue,
        reviewNotes: nextReviewNotes,
      },
    });

    if (hasFieldEdits) {
      await prisma.auditLogEntry.create({
        data: {
          organizationId: doc.session.organizationId,
          userId: doc.session.userId,
          action: "document_fields_edited",
          entityType: "CaptureDocument",
          entityId: docId,
          metadata: { sessionId, changes } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    if (fieldDisposition) {
      await prisma.auditLogEntry.create({
        data: {
          organizationId: doc.session.organizationId,
          userId: doc.session.userId,
          action:
            fieldDisposition.status === null
              ? "document_field_disposition_cleared"
              : "document_field_disposition_set",
          entityType: "CaptureDocument",
          entityId: docId,
          metadata: {
            sessionId,
            fieldKey: fieldDisposition.fieldKey,
            status: fieldDisposition.status,
            rationale: fieldDisposition.rationale?.trim() || null,
          },
        },
      });
    }

    // Auto re-verify (best-effort — don't fail the save if verification breaks)
    let verification = null;
    if (hasFieldEdits) {
      try {
        const verifyResult = await verifyDocuments(sessionId, doc.session.userId);
        verification = verifyResult.verification;
      } catch (verifyError) {
        console.warn(
          "Re-verification after edit failed (non-blocking):",
          verifyError instanceof Error ? verifyError.message : verifyError
        );
      }
    }

    return NextResponse.json({
      id: updated.id,
      documentType: updated.documentType,
      status: updated.status,
      contentJson: existingContent,
      reviewNotes: updated.reviewNotes,
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
