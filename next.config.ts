import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable Turbopack's persistent filesystem cache.
    // It writes .sst files that corrupt easily, crashing the dev server.
    turbopackFileSystemCacheForDev: false,
    // Disable isolated dev build — Next.js 16 moved dev output to .next/dev/
    // which causes missing manifest errors on first compile.
    isolatedDevBuild: false,
  },
};

export default nextConfig;
