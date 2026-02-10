import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Next.js NOT to bundle these packages — use them as-is at runtime.
  // This is critical for native modules (better-sqlite3) which contain
  // compiled C++ code that webpack can't process. Without this, the bundler
  // tries to parse native .node files and gets stuck, causing the dev server
  // to take 40+ seconds to start instead of ~5 seconds.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "@prisma/client",
    "prisma",
    "pdf-lib",
    "@anthropic-ai/sdk",
  ],

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
