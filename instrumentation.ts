// Next.js instrumentation hook — this file is loaded once when the server starts.
// It initializes Sentry on the server side and hooks into Next.js error reporting.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Load server-side Sentry config
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Load edge runtime Sentry config
    await import("./sentry.edge.config");
  }
}

// Automatically capture unhandled errors from API routes and server components
export const onRequestError = Sentry.captureRequestError;
