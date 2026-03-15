// Electronic signature utilities for AeroVision.
// Computes SHA-256 hashes of document content and manages
// the signing workflow for regulatory documents.

import { createHash } from "crypto";
import { prisma } from "@/lib/db";

// Compute SHA-256 hash of document content (the tamper-evident fingerprint)
export function computeDocumentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// Sign a document — creates a Signature record and updates the GeneratedDocument status
export async function signDocument(params: {
  documentId: string;
  signerId: string;
  signerName: string;
  signerEmail?: string;
  signerRole: string;
  certificateRef?: string;
  signatureImage?: string; // Base64 PNG from signature pad
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ success: boolean; signatureId?: string; error?: string }> {
  // Look up the document
  const doc = await prisma.generatedDocument.findUnique({
    where: { id: params.documentId },
  });

  if (!doc) {
    return { success: false, error: "Document not found" };
  }

  if (doc.status === "signed") {
    return { success: false, error: "Document is already signed" };
  }

  // Compute the hash of the document content at time of signing
  const documentHash = computeDocumentHash(doc.content);

  // Create signature record and update document in a transaction
  const signature = await prisma.$transaction(async (tx) => {
    // Create the signature record
    const sig = await tx.signature.create({
      data: {
        documentId: params.documentId,
        signerId: params.signerId,
        signerName: params.signerName,
        signerEmail: params.signerEmail || null,
        signerRole: params.signerRole,
        certificateRef: params.certificateRef || null,
        documentHash,
        signatureImage: params.signatureImage || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });

    // Update the document status to signed
    await tx.generatedDocument.update({
      where: { id: params.documentId },
      data: {
        status: "signed",
        approvedBy: params.signerName,
        approvedAt: new Date(),
        signatureRef: sig.id,
        hash: documentHash,
      },
    });

    return sig;
  });

  return { success: true, signatureId: signature.id };
}

// Verify a document's signature — checks that the current content matches
// the hash recorded at time of signing (tamper detection)
export async function verifySignature(documentId: string): Promise<{
  valid: boolean;
  tampered: boolean;
  signature?: {
    signerName: string;
    signerRole: string;
    certificateRef: string | null;
    signedAt: Date;
    documentHash: string;
  };
}> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id: documentId },
  });

  if (!doc || !doc.signatureRef) {
    return { valid: false, tampered: false };
  }

  const signature = await prisma.signature.findUnique({
    where: { id: doc.signatureRef },
  });

  if (!signature) {
    return { valid: false, tampered: false };
  }

  // Recompute hash and compare
  const currentHash = computeDocumentHash(doc.content);
  const tampered = currentHash !== signature.documentHash;

  return {
    valid: !tampered,
    tampered,
    signature: {
      signerName: signature.signerName,
      signerRole: signature.signerRole,
      certificateRef: signature.certificateRef,
      signedAt: signature.signedAt,
      documentHash: signature.documentHash,
    },
  };
}
