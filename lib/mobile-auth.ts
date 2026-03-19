// Mobile API authentication helper
// Used by all /api/mobile/* endpoints
//
// Supports two auth methods:
// 1. JWT Bearer token (from /api/mobile/login) — resolves to the real technician
// 2. Legacy fallback — returns demo technician when no auth header is present
//
// JWT is tried first. If no Authorization header, falls back to demo technician
// so existing mobile flows don't break during migration.

import { jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getMobileSigningKey } from "@/lib/mobile-jwt";

export interface AuthenticatedTechnician {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  badgeNumber: string;
  role: string;
  organizationId: string;
}

// Demo technician — used as fallback when no auth header is present
const DEMO_TECHNICIAN: AuthenticatedTechnician = {
  id: "tech-mike-chen",
  firstName: "Mike",
  lastName: "Chen",
  email: "mike.chen@precisionaero.example.com",
  badgeNumber: "PAM-1001",
  role: "TECHNICIAN",
  organizationId: "demo-precision-aero",
};

export async function authenticateRequest(
  request: Request
): Promise<{ technician: AuthenticatedTechnician } | { error: NextResponse }> {
  const authHeader = request.headers.get("Authorization");

  // No auth header → fall back to demo technician (backwards compatible)
  if (!authHeader?.startsWith("Bearer ")) {
    return { technician: DEMO_TECHNICIAN };
  }

  const token = authHeader.slice(7);

  // Try JWT verification
  try {
    const { payload } = await jwtVerify(token, getMobileSigningKey());

    const technicianId = payload.technicianId as string | undefined;
    if (!technicianId) {
      return {
        error: NextResponse.json(
          { error: "Invalid token: missing technicianId" },
          { status: 401 }
        ),
      };
    }

    // Look up the technician from the database
    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        badgeNumber: true,
        role: true,
        organizationId: true,
      },
    });

    if (!technician) {
      return {
        error: NextResponse.json(
          { error: "Technician not found" },
          { status: 401 }
        ),
      };
    }

    return { technician };
  } catch {
    // JWT verification failed (expired, bad signature, etc.)
    return {
      error: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      ),
    };
  }
}
