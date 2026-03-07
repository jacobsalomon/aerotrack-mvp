// Database connection singleton
// Uses Turso (cloud SQLite) when TURSO_DATABASE_URL is set (production),
// falls back to local SQLite file for local development.

import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createPrismaClient() {
  const adapter = new PrismaLibSql({
    url: process.env.TURSO_DATABASE_URL ?? "file:./dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return new PrismaClient({ adapter });
}

function getSchemaFingerprint() {
  const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
  if (!existsSync(schemaPath)) return "schema-missing";

  return createHash("sha1")
    .update(readFileSync(schemaPath, "utf8"))
    .digest("hex");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaFingerprint: string | undefined;
};

const schemaFingerprint = getSchemaFingerprint();

if (
  !globalForPrisma.prisma ||
  globalForPrisma.prismaSchemaFingerprint !== schemaFingerprint
) {
  void globalForPrisma.prisma?.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = createPrismaClient();
  globalForPrisma.prismaSchemaFingerprint = schemaFingerprint;
}

export const prisma = globalForPrisma.prisma as PrismaClient;
