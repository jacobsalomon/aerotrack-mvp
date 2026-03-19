// POST /api/technicians/verify-certificate
// Verifies a user's FAA certificate against the public database.
// Requires ADMIN role.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { verifyUserCertificate } from "@/lib/faa-certificate-lookup";

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, certificateNumber } = body;

  if (!userId || !certificateNumber) {
    return NextResponse.json(
      { error: "userId and certificateNumber are required" },
      { status: 400 }
    );
  }

  try {
    const { result, updated } = await verifyUserCertificate(
      userId,
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
