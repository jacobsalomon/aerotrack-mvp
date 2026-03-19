// Middleware — protects all /aerovision/* routes except public ones.
// Uses the edge-compatible auth config (no Prisma/bcrypt imports).
// Unauthenticated users get redirected to the login page.

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

// Match all routes under /aerovision EXCEPT:
// - /login, /register, /forgot-password, /reset-password (auth pages)
// - /api/auth/* (NextAuth endpoints + our custom auth APIs)
// - /api/mobile/* (mobile app uses API key auth, not sessions)
// - /api/capture/* (capture endpoints use API key auth)
//
// Because basePath is /aerovision, the middleware sees paths WITHOUT the prefix.
// E.g., /aerovision/demo becomes /demo in the matcher.
export const config = {
  matcher: [
    "/((?!login|register|forgot-password|reset-password|api/auth|api/mobile|api/capture|_next/static|_next/image|favicon.ico).*)",
  ],
};
