// POST /api/technicians/verify-certificate
// Verifies a technician's FAA certificate against the public database.
// Requires ADMIN role.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { verifyTechnicianCertificate } from "@/lib/faa-certificate-lookup";

export async function POST(request: Request) {
  const authResult = await requireAdmin(request);
  if (authResult.error) return authResult.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { technicianId, certificateNumber } = body;

  if (!technicianId || !certificateNumber) {
    return NextResponse.json(
      { error: "technicianId and certificateNumber are required" },
      { status: 400 }
    );
  }

  try {
    const { result, updated } = await verifyTechnicianCertificate(
      technicianId,
      certificateNumber
    );

    return NextResponse.json({
      success: true,
      verified: result.found && result.isValid,
      updated,
      certificate: result,
    });
  } catch (err) {
    console.error("Certificate verification failed:", err);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
