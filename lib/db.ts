// Database connection singleton.
// Uses Neon serverless HTTP adapter — avoids TCP/SSL issues on Vercel.
import "server-only";

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
