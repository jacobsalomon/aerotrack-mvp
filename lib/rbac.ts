// Role-Based Access Control (RBAC) for AeroVision API routes.
// With email/password auth, everyone gets the "USER" role.
// The role system is kept in place for future expansion.
//
// Usage in API routes:
//   const authResult = await requireAuth(request);
//   if (authResult.error) return authResult.error;
//   // authResult.user is available with id, role, email, organizationId, badgeNumber

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// All valid roles, ordered by privilege level
export const ROLES = ["USER", "SUPERVISOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Role hierarchy — higher roles include lower role permissions
const ROLE_LEVEL: Record<Role, number> = {
  USER: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  organizationId: string | null;
  badgeNumber: string | null;
  firstName: string | null;
  lastName: string | null;
}

type RbacSuccess = { user: AuthenticatedUser; error?: never };
type RbacFailure = { user?: never; error: NextResponse };
type RbacResult = RbacSuccess | RbacFailure;

// Check if a role has at least the minimum required privilege level
export function hasRole(userRole: string, minimumRole: Role): boolean {
  const userLevel = ROLE_LEVEL[userRole as Role] ?? 0;
  const requiredLevel = ROLE_LEVEL[minimumRole];
  return userLevel >= requiredLevel;
}

// Check if a role is in a specific list of allowed roles
export function isRoleAllowed(userRole: string, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole as Role);
}

// Main RBAC guard for API routes.
// Checks NextAuth session and verifies role.
export async function requireRole(
  _request: Request,
  allowedRoles: Role[]
): Promise<RbacResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized", message: "Sign in required" },
        { status: 401 }
      ),
    };
  }

  const userRole = (session.user.role || "USER") as Role;

  if (!isRoleAllowed(userRole, allowedRoles)) {
    return {
      error: NextResponse.json(
        {
          error: "Forbidden",
          message: `Role "${userRole}" does not have access. Required: ${allowedRoles.join(" or ")}`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      role: userRole,
      organizationId: session.user.organizationId ?? null,
      badgeNumber: session.user.badgeNumber ?? null,
      firstName: session.user.firstName ?? null,
      lastName: session.user.lastName ?? null,
    },
  };
}

// Convenience wrappers for common role checks

// Any authenticated user
export async function requireAuth(request: Request): Promise<RbacResult> {
  return requireRole(request, ["USER", "SUPERVISOR", "ADMIN"]);
}

// Supervisor or Admin only
export async function requireSupervisor(request: Request): Promise<RbacResult> {
  return requireRole(request, ["SUPERVISOR", "ADMIN"]);
}

// Admin only
export async function requireAdmin(request: Request): Promise<RbacResult> {
  return requireRole(request, ["ADMIN"]);
}
