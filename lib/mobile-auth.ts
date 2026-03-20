// Mobile API authentication helper
// Used by all /api/mobile/* endpoints
//
// Requires JWT Bearer token (from /api/mobile/auth).
// Returns 401 if no valid token is present.

import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { getMobileSigningKey } from "@/lib/mobile-jwt";
import type { AuthenticatedUser } from "@/lib/rbac";

// Re-export for convenience — all consumers use the same type
export type { AuthenticatedUser } from "@/lib/rbac";

export async function authenticateRequest(
  request: Request
): Promise<{ user: AuthenticatedUser } | { error: NextResponse }> {
  const authHeader = request.headers.get("Authorization");

  // No auth header → reject
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json(
        { success: false, error: "Authorization header required. Use POST /api/mobile/auth to get a token." },
        { status: 401 }
      ),
    };
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
