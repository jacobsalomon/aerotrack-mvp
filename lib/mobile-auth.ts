// Mobile API authentication helper
// Used by all /api/mobile/* endpoints
//
// Auth is currently bypassed — all requests get the demo technician.
// This lets the iOS app work without any API key setup.
// When we add real multi-user support, re-enable key validation here.

import { NextResponse } from "next/server";

export interface AuthenticatedTechnician {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  badgeNumber: string;
  role: string;
  organizationId: string;
}

// Demo technician — used for all mobile requests until we need real auth
const DEMO_TECHNICIAN: AuthenticatedTechnician = {
  id: "tech-mike-chen",
  firstName: "Mike",
  lastName: "Chen",
  email: "mike.chen@precisionaero.example.com",
  badgeNumber: "PAM-1001",
  role: "TECHNICIAN",
  organizationId: "demo-precision-aero",
};

// Returns the demo technician for every request (no auth check).
// Keeps the union return type so all existing call sites compile unchanged.
export async function authenticateRequest(
  request: Request
): Promise<{ technician: AuthenticatedTechnician } | { error: NextResponse }> {
  void request;
  return { technician: DEMO_TECHNICIAN };
}
