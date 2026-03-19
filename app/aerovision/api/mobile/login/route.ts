// POST /api/mobile/login — Authenticate with email/password, return a JWT.
// Uses the same User table and bcrypt hashing as the NextAuth web login.
// The JWT contains the technician's ID and org so the mobile app can make
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

    // Find the linked Technician record by email
    const technician = await prisma.technician.findUnique({
      where: { email: email.toLowerCase().trim() },
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
      return NextResponse.json(
        { error: "No technician profile linked to this account" },
        { status: 403 }
      );
    }

    // Sign a JWT with technician claims
    const token = await new SignJWT({
      sub: user.id,
      technicianId: technician.id,
      organizationId: technician.organizationId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(getMobileSigningKey());

    return NextResponse.json({
      token,
      technician: {
        id: technician.id,
        firstName: technician.firstName,
        lastName: technician.lastName,
        email: technician.email,
        badgeNumber: technician.badgeNumber,
        role: technician.role,
        organizationId: technician.organizationId,
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
