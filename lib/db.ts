// Database connection singleton
// Uses Turso (cloud SQLite) when TURSO_DATABASE_URL is set (production),
// falls back to local SQLite file for local development.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Connect to Turso in production, local file in dev
const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
