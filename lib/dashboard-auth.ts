// Dashboard authentication helper
// Checks for the session cookie set by /api/auth/verify-passcode.
// Used by web dashboard API routes to prevent unauthenticated access.

import { NextResponse } from "next/server";

const COOKIE_NAME = "av-session";
const SESSION_TOKEN = "authenticated";

export function requireDashboardAuth(request: Request): NextResponse | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").map((c) => {
      const [key, ...rest] = c.split("=");
      return [key, rest.join("=")];
    })
  );

  if (cookies[COOKIE_NAME] !== SESSION_TOKEN) {
    return NextResponse.json(
      { error: "Unauthorized — passcode required" },
      { status: 401 }
    );
  }

  // Auth passed — return null so the route can continue
  return null;
}
