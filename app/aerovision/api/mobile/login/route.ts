// POST /api/mobile/login — Authenticate with email/password, return a JWT.
// Uses the same User table and bcrypt hashing as the NextAuth web login.
// The JWT contains the user's ID and org so the mobile app can make
// authenticated API calls as the correct user.

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
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Look up the User record (same table NextAuth uses)
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Verify password with bcrypt (same as NextAuth Credentials provider)
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Ensure user has required profile fields for mobile use
    if (!user.organizationId || !user.badgeNumber) {
      return NextResponse.json(
        { error: "No technician profile linked to this account" },
        { status: 403 }
      );
    }

    // Sign a JWT with user claims
    const token = await new SignJWT({
      sub: user.id,
      userId: user.id,
      organizationId: user.organizationId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(getMobileSigningKey());

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        badgeNumber: user.badgeNumber,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (error) {
    console.error("Mobile login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
