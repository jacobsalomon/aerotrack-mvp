// Middleware — protects all /aerovision/* routes except public ones.
// Uses the edge-compatible auth config (no Prisma/bcrypt imports).
// Unauthenticated users get redirected to the login page.
//
// Includes a timeout guard: if JWT decryption hangs (e.g., corrupted token
// after a failed deployment), the middleware clears the bad cookie and
// redirects to login instead of hanging indefinitely.

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextRequest, NextResponse } from "next/server";

const nextAuth = NextAuth(authConfig);

// The NextAuth auth handler used as middleware
const authMiddleware = nextAuth.auth;

// Wrap the NextAuth middleware with a timeout to prevent hung requests
// from corrupted JWT tokens. If auth takes longer than 5 seconds,
// clear the session cookie and redirect to login.
export default async function middleware(request: NextRequest) {
  const SESSION_COOKIE = "__Secure-authjs.session-token";
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  // If there's no session cookie, just run auth normally (fast path)
  if (!hasSessionCookie) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (authMiddleware as any)(request);
  }

  // Race the auth check against a timeout
  const timeoutMs = 5000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authPromise = (authMiddleware as any)(request) as Promise<NextResponse>;
  const timeoutPromise = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs)
  );

  const result = await Promise.race([authPromise, timeoutPromise]);

  if (result === "timeout") {
    // Auth hung — the JWT token is likely corrupted.
    // Clear the bad cookie and redirect to login.
    console.error("[middleware] Auth timed out — clearing corrupt session cookie");
    const loginUrl = new URL("/aerovision/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete("authjs.session-token");
    response.cookies.delete("__Secure-authjs.callback-url");
    response.cookies.delete("__Host-authjs.csrf-token");
    return response;
  }

  return result;
}

// Match all routes under /aerovision EXCEPT:
// - /login, /register, /forgot-password, /reset-password (auth pages)
// - /api/auth/* (NextAuth endpoints + our custom auth APIs)
// - /api/mobile/* (mobile app uses API key auth, not sessions)
// - /api/capture/* (capture endpoints use API key auth)
// - /api/clear-session (emergency cookie clearing endpoint)
//
// Because basePath is /aerovision, the middleware sees paths WITHOUT the prefix.
// E.g., /aerovision/demo becomes /demo in the matcher.
export const config = {
  matcher: [
    "/((?!login|register|forgot-password|reset-password|api/auth|api/mobile|api/capture|api/clear-session|api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};
