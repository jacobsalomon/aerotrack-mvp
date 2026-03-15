// Sentry server-side configuration — captures errors and performance data
// from API routes, server components, and background jobs.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture 100% of errors
  // For performance traces, sample 20% in production (plenty for a PoC)
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Tag every event with the environment so you can filter in Sentry
  environment: process.env.NODE_ENV || "development",

  // Don't send events if no DSN is configured (local dev without Sentry)
  enabled: !!process.env.SENTRY_DSN,
});
