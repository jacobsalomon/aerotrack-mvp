import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Serve all routes under /aerovision so the gateway domain
  // (mechanicalvisioncorp.com) can proxy here via rewrites.
  basePath: "/aerovision",

  // basePath breaks Next.js Image optimization on Vercel — disable it
  // and use unoptimized images instead.
  images: {
    unoptimized: true,
  },

  // Don't expose framework info in response headers
  poweredByHeader: false,

  // Expose basePath to client-side fetch() calls via lib/api-url.ts.
  // <Link> and <Image> auto-prepend basePath, but fetch() does not.
  env: {
    NEXT_PUBLIC_BASE_PATH: "/aerovision",
  },

  async redirects() {
    return [
      {
        source: "/aerovision-demo",
        destination: "/aerovision",
        permanent: true,
      },
      {
        source: "/aerovision-demo/:path*",
        destination: "/aerovision/:path*",
        permanent: true,
      },
    ];
  },

  // Tell Next.js NOT to bundle these packages — use them as-is at runtime.
  // Without this, the bundler tries to process native modules and gets stuck,
  // causing the dev server to take 40+ seconds to start instead of ~5 seconds.
  serverExternalPackages: [
    "@prisma/adapter-neon",
    "@prisma/client",
    "prisma",
    "pdf-lib",
    "@anthropic-ai/sdk",
    "bcryptjs",
    "resend",
  ],

  // Security headers for all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },

  experimental: {
    // Tree-shake barrel exports from large icon/component libraries.
    // Without this, importing { Plane } from "lucide-react" pulls in
    // ALL 1,500+ icons during compilation instead of just the one you need.
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "radix-ui",
      "date-fns",
    ],
  },
};

// Wrap with Sentry for automatic error and performance monitoring.
// When no SENTRY_DSN is set, Sentry is disabled and this is a no-op.
export default withSentryConfig(nextConfig, {
  // Suppress noisy Sentry build logs
  silent: true,

  // Skip source map uploads when no auth token is set
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
