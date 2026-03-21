// POST /api/mobile/auth — Authenticate with email/password, return a JWT.
// Uses the same User table and bcrypt hashing as the NextAuth web login.
// The response shape matches what the iOS app's LoginResponse model expects.

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getMobileSigningKey } from "@/lib/mobile-jwt";

const TOKEN_EXPIRY = "90d";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Look up the user (same table NextAuth uses)
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { organization: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password with bcrypt
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Require org membership — orgless users can't do anything useful
    if (!user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Your account is not assigned to an organization. Please join one at the web dashboard first." },
        { status: 403 }
      );
    }

    // Sign a JWT with all user claims
    const token = await new SignJWT({
      sub: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.badgeNumber && { badgeNumber: user.badgeNumber }),
      role: user.role,
      ...(user.organizationId && { organizationId: user.organizationId }),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(getMobileSigningKey());

    // Response shape matches the iOS LoginResponse model
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
          email: user.email,
          badgeNumber: user.badgeNumber,
          role: user.role,
          organizationId: user.organizationId,
        },
        organization: user.organization
          ? {
              id: user.organization.id,
              name: user.organization.name,
              faaRepairStationCert: user.organization.faaRepairStationCert ?? null,
            }
          : null,
        token,
      },
    });
  } catch (error) {
    console.error("[Mobile auth error]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
