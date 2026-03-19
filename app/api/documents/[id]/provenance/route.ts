import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getDocumentProvenance } from "@/lib/document-provenance";

// GET /api/documents/[id]/provenance
// Returns field-level evidence mappings for both seeded demo docs and live capture docs.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const provenance = await getDocumentProvenance(id);

  if (!provenance) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json(provenance);
}
