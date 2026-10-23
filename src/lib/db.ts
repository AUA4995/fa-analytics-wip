import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dbSchema, pgConnectionString, searchPathOption } from "./db-url";

/**
 * Single Prisma client for the app (Prisma 7, driver-adapter mode — no Rust engine).
 * Created lazily on first use so importing modules never requires DATABASE_URL
 * (pure unit tests, build time); re-used across hot reloads in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
  }
  const schema = dbSchema(connectionString);
  // search_path = the app's schema, so raw SQL ($queryRaw: rate limits, 2FA, snapshots) finds the same tables as the
  // Prisma models — e.g. Asal's laptop keeps them in "accounts_hub" inside the CLM database, not "public".
  const adapter = new PrismaPg({ connectionString: pgConnectionString(connectionString), options: searchPathOption(schema) }, { schema });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
