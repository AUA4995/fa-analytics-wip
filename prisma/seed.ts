/**
 * Seed defaults: the company record, the two sites and the cost pool structure (no amounts). Safe to re-run — uses upserts and never overwrites values edited in Settings.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dbSchema, pgConnectionString, searchPathOption } from "../src/lib/db-url";
import { ensureModelDefaults } from "../src/lib/model/defaults";

const url = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: pgConnectionString(url), options: searchPathOption(dbSchema(url)) }, { schema: dbSchema(url) }) });

async function main() {
  const existed = !!(await prisma.company.findUnique({ where: { id: "default" }, select: { id: true } }));
  await prisma.company.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Fulfilment Australia", shortName: "FA", primaryColour: "#1F54EE", accentColour: "#010028", textColour: "#14132E", timezone: "Australia/Sydney" },
  });
  console.log(existed ? "Company already set up — nothing changed." : "Company record created.");
  const added = await ensureModelDefaults(prisma);
  console.log(added ? `Cost model: ${added} sites / cost pools added.` : "Cost model: sites and cost pools already there.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
