// Dev-only auto-login route.
// Navigate to /aerovision/api/auth/dev-login to instantly sign in as a dev user.
// Accepts optional ?email= and ?redirect=/path query params.
// Only works in development — returns 404 in production.

import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Use ?email= to pick a specific user, otherwise grab the first user with an org
  const requestedEmail = request.nextUrl.searchParams.get("email");

  const user = requestedEmail
    ? await prisma.user.findUnique({
        where: { email: requestedEmail },
        select: { id: true, name: true, email: true, role: true, organizationId: true, badgeNumber: true, firstName: true, lastName: true },
      })
    : await prisma.user.findFirst({
        where: { organizationId: { not: null } },
        select: { id: true, name: true, email: true, role: true, organizationId: true, badgeNumber: true, firstName: true, lastName: true },
      });

  if (!user) {
    return NextResponse.json(
      { error: "No users found in the database. Run: npx prisma db seed" },
      { status: 500 }
    );
  }

  // Build the JWT token with the same fields the auth callbacks use
  const token = await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      badgeNumber: user.badgeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      sub: user.id,
    },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
  });

  // Redirect to the requested page (default: /aerovision/jobs)
  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/aerovision/jobs";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  // Set the session cookie (dev mode uses "authjs.session-token" without __Secure- prefix)
  response.cookies.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}
