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
import { NextResponse } from "next/server";
import { getMobileSigningKey } from "@/lib/mobile-jwt";
import type { AuthenticatedUser } from "@/lib/rbac";

// Re-export for convenience — all consumers use the same type
export type { AuthenticatedUser } from "@/lib/rbac";

// Demo user — used as fallback when no auth header is present
const DEMO_USER: AuthenticatedUser = {
  id: "tech-mike-chen",
  firstName: "Mike",
  lastName: "Chen",
  email: "mike.chen@precisionaero.example.com",
  badgeNumber: "PAM-1001",
  role: "USER",
  name: "Mike Chen",
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

  // Try JWT verification — all user data is in the token claims,
  // no database lookup needed (faster + works even if DB is slow)
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

    return {
      user: {
        id: userId,
        email: (payload.email as string) ?? null,
        name: (payload.name as string) ?? null,
        firstName: (payload.firstName as string) ?? null,
        lastName: (payload.lastName as string) ?? null,
        badgeNumber: (payload.badgeNumber as string) ?? null,
        role: ((payload.role as string) ?? "USER") as AuthenticatedUser["role"],
        organizationId: (payload.organizationId as string) ?? null,
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
