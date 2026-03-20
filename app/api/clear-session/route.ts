// GET /api/clear-session
// Emergency endpoint to clear corrupted auth cookies.
// Excluded from middleware auth checks so it always works.
// Redirects to login after clearing cookies.

import { NextResponse } from "next/server";

export async function GET() {
  const loginUrl = new URL("/aerovision/login", "https://mechanicalvisioncorp.com");
  const response = NextResponse.redirect(loginUrl);

  // Clear all auth-related cookies
  response.cookies.delete("__Secure-authjs.session-token");
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.callback-url");
  response.cookies.delete("__Host-authjs.csrf-token");

  return response;
}
