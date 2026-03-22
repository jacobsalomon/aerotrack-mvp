// Export human corrections from DB to eval/corrections.jsonl
// Usage: set -a && source .env.production && set +a && npx tsx scripts/export-corrections.ts

import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const items = await prisma.inspectionItem.findMany({
    where: { correctedAt: { not: null } },
    include: {
      section: {
        select: {
          figureNumber: true,
          title: true,
          pageNumbers: true,
          template: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { correctedAt: "asc" },
  });

  const lines = items
    .filter((item) => item.humanCorrection)
    .map((item) => JSON.stringify({
      id: item.id,
      action: (item.humanCorrection as { action: string }).action,
      templateId: item.section.template.id,
      figureNumber: item.section.figureNumber,
      pageNumbers: item.section.pageNumbers,
      correctedAt: item.correctedAt?.toISOString(),
      currentItem: {
        itemType: item.itemType,
        parameterName: item.parameterName,
        specification: item.specification,
        specValueLow: item.specValueLow,
        specValueHigh: item.specValueHigh,
        specUnit: item.specUnit,
      },
      original: (item.humanCorrection as { original?: unknown }).original ?? null,
    }));

  const outPath = resolve(__dirname, "../eval/corrections.jsonl");
  writeFileSync(outPath, lines.length > 0 ? lines.join("\n") + "\n" : "");

  const corrections = lines.filter((l) => l.includes('"corrected"')).length;
  const approvals = lines.length - corrections;
  console.log(`Exported ${lines.length} records (${corrections} corrections, ${approvals} approvals)`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
