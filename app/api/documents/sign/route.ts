// POST /api/documents/sign
// Electronically signs a GeneratedDocument.
// Requires SUPERVISOR or ADMIN role.
// Creates a Signature record with SHA-256 hash and updates document status.

import { NextResponse } from "next/server";
import { requireSupervisor } from "@/lib/rbac";
import { signDocument } from "@/lib/esignature";

export async function POST(request: Request) {
  // Only supervisors and admins can sign documents
  const authResult = await requireSupervisor(request);
  if (authResult.error) return authResult.error;

  const user = authResult.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { documentId, signatureImage, certificateRef } = body;

  if (!documentId) {
    return NextResponse.json(
      { error: "documentId is required" },
      { status: 400 }
    );
  }

  // Get client metadata for audit trail
  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  const result = await signDocument({
    documentId,
    signerId: user.id,
    signerName: user.name || user.email || "Unknown",
    signerEmail: user.email || undefined,
    signerRole: user.role,
    certificateRef: certificateRef || undefined,
    signatureImage: signatureImage || undefined,
    ipAddress,
    userAgent,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    signatureId: result.signatureId,
  });
}
