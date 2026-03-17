import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { getDocumentProvenance } from "@/lib/document-provenance";

// GET /api/documents/[id]/provenance
// Returns field-level evidence mappings for both seeded demo docs and live capture docs.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireDashboardAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const provenance = await getDocumentProvenance(id);

  if (!provenance) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json(provenance);
}
