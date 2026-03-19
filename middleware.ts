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
// - /api/shifts/.*/audio (desk mic uploads — auth handled in route handler;
//   middleware can interfere with large FormData bodies and cause silent redirects)
//
// Because basePath is /aerovision, the middleware sees paths WITHOUT the prefix.
// E.g., /aerovision/demo becomes /demo in the matcher.
export const config = {
  matcher: [
    "/((?!login|register|forgot-password|reset-password|api/auth|api/org|api/mobile|api/capture|api/shifts/.*/audio|_next/static|_next/image|favicon.ico).*)",
  ],
};
