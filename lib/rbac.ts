// Role-Based Access Control (RBAC) for AeroVision API routes.
// Enforces three roles: TECHNICIAN, SUPERVISOR, ADMIN.
//
// TECHNICIAN — can view own sessions, upload evidence, view own data
// SUPERVISOR — can review/approve documents, view all sessions in their org
// ADMIN      — can manage everything: users, CMM library, system settings
//
// Usage in API routes:
//   const authResult = await requireRole(request, ["SUPERVISOR", "ADMIN"]);
//   if (authResult.error) return authResult.error;
//   // authResult.user is available with id, role, email, technicianId

import { auth } from "@/lib/auth";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { NextResponse } from "next/server";

// All valid roles, ordered by privilege level
export const ROLES = ["TECHNICIAN", "SUPERVISOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Role hierarchy — higher roles include lower role permissions
const ROLE_LEVEL: Record<Role, number> = {
  TECHNICIAN: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  technicianId: string | null;
  authMethod: "oauth" | "passcode";
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
// Checks authentication (OAuth session or passcode cookie) then verifies role.
// Pass an array of allowed roles, or a single minimum role for hierarchy check.
export async function requireRole(
  request: Request,
  allowedRoles: Role[]
): Promise<RbacResult> {
  // Try OAuth session first (Auth.js)
  const session = await auth();

  if (session?.user) {
    const userRole = (session.user.role || "TECHNICIAN") as Role;

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
        technicianId: session.user.technicianId ?? null,
        authMethod: "oauth",
      },
    };
  }

  // Fall back to passcode cookie (demo mode)
  // Passcode users are treated as ADMIN (they have the passcode = full access)
  const passcodeError = requireDashboardAuth(request);

  if (passcodeError) {
    // Neither OAuth nor passcode authenticated
    return {
      error: NextResponse.json(
        { error: "Unauthorized", message: "Sign in required" },
        { status: 401 }
      ),
    };
  }

  // Passcode-authenticated users get ADMIN role (they have the secret)
  const passcodeRole: Role = "ADMIN";

  if (!isRoleAllowed(passcodeRole, allowedRoles)) {
    return {
      error: NextResponse.json(
        { error: "Forbidden", message: "Insufficient role" },
        { status: 403 }
      ),
    };
  }

  return {
    user: {
      id: "passcode-user",
      email: null,
      name: "Demo User",
      role: passcodeRole,
      technicianId: null,
      authMethod: "passcode",
    },
  };
}

// Convenience wrappers for common role checks

// Any authenticated user (TECHNICIAN, SUPERVISOR, or ADMIN)
export async function requireAuth(request: Request): Promise<RbacResult> {
  return requireRole(request, ["TECHNICIAN", "SUPERVISOR", "ADMIN"]);
}

// Supervisor or Admin only
export async function requireSupervisor(request: Request): Promise<RbacResult> {
  return requireRole(request, ["SUPERVISOR", "ADMIN"]);
}

// Admin only
export async function requireAdmin(request: Request): Promise<RbacResult> {
  return requireRole(request, ["ADMIN"]);
}
