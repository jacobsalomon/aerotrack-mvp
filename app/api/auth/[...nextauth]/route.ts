// Auth.js route handler — processes OAuth callbacks and session management.
// This handles all /api/auth/* routes (sign in, sign out, callbacks, etc.)

import { handlers } from "@/lib/auth";

// NextAuth v5 beta types NextRequest; Next.js route handlers receive Request.
const { GET, POST } = handlers as {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
};

export { GET, POST };
