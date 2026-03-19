// Mobile API authentication helper
// Used by all /api/mobile/* endpoints
//
// Supports two auth methods:
// 1. JWT Bearer token (from /api/mobile/login) — resolves to the real user
// 2. Legacy fallback — returns demo user when no auth header is present
//
// JWT is tried first. If no Authorization header, falls back to demo user
// so existing mobile flows don't break during migration.

import { jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getMobileSigningKey } from "@/lib/mobile-jwt";

export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  badgeNumber: string;
  role: string;
  organizationId: string;
}

// Demo user — used as fallback when no auth header is present
const DEMO_USER: AuthenticatedUser = {
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
): Promise<{ user: AuthenticatedUser } | { error: NextResponse }> {
  const authHeader = request.headers.get("Authorization");

  // No auth header → fall back to demo user (backwards compatible)
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: DEMO_USER };
  }

  const token = authHeader.slice(7);

  // Try JWT verification
  try {
    const { payload } = await jwtVerify(token, getMobileSigningKey());

    const userId = payload.userId as string | undefined;
    if (!userId) {
      return {
        error: NextResponse.json(
          { error: "Invalid token: missing userId" },
          { status: 401 }
        ),
      };
    }

    // Look up the user from the database
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!user || !user.email || !user.badgeNumber || !user.organizationId) {
      return {
        error: NextResponse.json(
          { error: "User not found or missing profile data" },
          { status: 401 }
        ),
      };
    }

    return {
      user: {
        id: user.id,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email,
        badgeNumber: user.badgeNumber,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
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
