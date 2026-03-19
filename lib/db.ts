// Database connection singleton.
// Uses DATABASE_URL from environment (Neon Postgres in production, local in dev).

if (typeof window !== "undefined") {
  throw new Error("lib/db must only be imported on the server");
}

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!globalForPrisma.prisma) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  globalForPrisma.prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma;
