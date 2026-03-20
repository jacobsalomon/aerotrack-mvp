// Database connection singleton.
// Uses DATABASE_URL from environment (Neon Postgres in production, local in dev).
// Uses the Neon serverless HTTP adapter for reliable connections on Vercel.
// The HTTP adapter avoids TCP connection issues (SSL negotiation, PG* env var
// conflicts, connection timeouts) that plague raw pg on serverless runtimes.

if (typeof window !== "undefined") {
  throw new Error("lib/db must only be imported on the server");
}

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!globalForPrisma.prisma) {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  globalForPrisma.prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma;
