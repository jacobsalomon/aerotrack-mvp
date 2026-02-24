import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve all routes under /aerovision-demo so the gateway domain
  // (mechanicalvisioncorp.com) can proxy here via rewrites.
  basePath: "/aerovision-demo",

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
    NEXT_PUBLIC_BASE_PATH: "/aerovision-demo",
  },

  // Tell Next.js NOT to bundle these packages — use them as-is at runtime.
  // Without this, the bundler tries to process native modules and gets stuck,
  // causing the dev server to take 40+ seconds to start instead of ~5 seconds.
  serverExternalPackages: [
    "@prisma/adapter-libsql",
    "@prisma/client",
    "@libsql/client",
    "@libsql/hrana-client",
    "@libsql/isomorphic-ws",
    "@libsql/isomorphic-fetch",
    "prisma",
    "pdf-lib",
    "@anthropic-ai/sdk",
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

export default nextConfig;
