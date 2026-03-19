// Forgot password API — generates a reset token and sends an email.
// Always returns 200 to prevent email enumeration attacks.

import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email?.toLowerCase().trim();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Look up the user (but don't reveal whether they exist)
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, passwordHash: true },
    });

    // Only send if user exists AND has a password (not OAuth-only)
    if (user?.passwordHash) {
      // Delete any existing tokens for this email
      await prisma.passwordResetToken.deleteMany({
        where: { email },
      });

      // Generate a secure random token
      const token = randomBytes(32).toString("hex");

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Save the token
      await prisma.passwordResetToken.create({
        data: { email, token, expiresAt },
      });

      // Send the reset email
      await sendPasswordResetEmail(email, token, user.name);
    }

    // Always return success (prevents email enumeration)
    return NextResponse.json({
      success: true,
      message: "If an account exists, a reset email has been sent",
    });
  } catch (error) {
    console.error("[ForgotPassword] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
