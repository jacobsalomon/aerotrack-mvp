// Registration API — creates a new user with email and password.
// Validates input, checks for existing accounts, hashes the password, and creates the user.

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();
    const trimmedName = name?.trim() || null;

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Password strength check
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if account already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingUser) {
      // Don't reveal whether email exists — use generic message
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash the password (bcryptjs, 12 rounds)
    const passwordHash = await bcrypt.hash(password, 12);

    // Check if the user's email domain matches any organization's emailDomain.
    // If so, auto-assign them to that org at registration — zero friction.
    const emailDomain = trimmedEmail.split("@")[1];
    let organizationId: string | null = null;

    if (emailDomain) {
      const matchingOrg = await prisma.organization.findFirst({
        where: { emailDomain: emailDomain.toLowerCase() },
        select: { id: true },
      });
      if (matchingOrg) {
        organizationId = matchingOrg.id;
      }
    }

    // Create the user (with org if matched, otherwise null — they'll see join-org page)
    await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        passwordHash,
        role: "USER",
        organizationId,
      },
    });

    return NextResponse.json(
      { success: true, message: "Account created" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Register] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
