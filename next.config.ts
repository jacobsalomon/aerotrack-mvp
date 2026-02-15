import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Creates a minimal self-contained build — only includes files actually needed.
  // Required for Docker/Railway/Fly.io deployment, and also speeds up the build
  // because webpack has far less to trace through.
  output: "standalone",

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
