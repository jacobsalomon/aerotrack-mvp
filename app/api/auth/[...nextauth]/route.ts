// Auth.js route handler — processes OAuth callbacks and session management.
// This handles all /api/auth/* routes (sign in, sign out, callbacks, etc.)

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
