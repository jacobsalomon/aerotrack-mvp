// POST /api/mobile/auth — Always succeeds with demo technician
// Auth is bypassed for MVP — the app just needs a success response to proceed.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: "tech-mike-chen",
        name: "Mike Chen",
        badgeNumber: "PAM-1001",
        email: "mike.chen@precisionaero.example.com",
        role: "TECHNICIAN",
        organizationId: "demo-precision-aero",
      },
      organization: {
        id: "demo-precision-aero",
        name: "Precision Aerospace MRO",
        faaRepairStationCert: "Y4PR509K",
      },
      token: "demo",
    },
  });
}
