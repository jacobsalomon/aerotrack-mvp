// GET /api/components/[id]/compliance
// Returns the AD/SB compliance report for a specific component.
// Shows which Airworthiness Directives and Service Bulletins apply
// and whether each one has been addressed.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { checkComponentCompliance } from "@/lib/ad-sb-tracker";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  const { id } = await params;

  try {
    const report = await checkComponentCompliance(id);
    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    console.error("Compliance check failed:", err);
    return NextResponse.json(
      { error: "Compliance check failed" },
      { status: 500 }
    );
  }
}
