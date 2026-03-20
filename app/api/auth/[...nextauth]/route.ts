// Auth.js route handler — processes OAuth callbacks and session management.
// This handles all /api/auth/* routes (sign in, sign out, callbacks, etc.)

import { handlers } from "@/lib/auth";

// Temporary debug wrapper to log the request URL NextAuth receives
const origGET = handlers.GET;
export async function GET(req: Request) {
  console.log("[auth-debug] Request URL:", req.url);
  console.log("[auth-debug] URL pathname:", new URL(req.url).pathname);
  return origGET(req);
}

export const { POST } = handlers;
