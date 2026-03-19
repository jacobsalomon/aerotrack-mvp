// DELETE /api/org/documents/[id] — Remove a PDF from your organization

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Find the document and verify it belongs to the user's org
  const doc = await prisma.orgDocument.findUnique({ where: { id } });

  if (!doc || doc.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Delete the file from Vercel Blob
  try {
    await del(doc.fileUrl);
  } catch {
    // File might already be gone — continue with DB cleanup
  }

  // Remove the database record
  await prisma.orgDocument.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
