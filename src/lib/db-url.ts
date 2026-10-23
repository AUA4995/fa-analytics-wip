/**
 * Connection helpers shared by the app, seed and CLI scripts.
 *
 * Prisma's driver adapter ignores `?schema=` in the URL, so we read it here and pass it
 * to PrismaPg explicitly. pg-boss gets its own schema next to it, so this app's jobs
 * never collide with another app (e.g. the CLM) using pg-boss in the same database.
 */
export function dbSchema(url = process.env.DATABASE_URL ?? ""): string {
  try {
    return new URL(url).searchParams.get("schema") || "public";
  } catch {
    return "public";
  }
}

/** URL without Prisma-only params (pg doesn't understand `schema`). */
export function pgConnectionString(url = process.env.DATABASE_URL ?? ""): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("schema");
    return u.toString();
  } catch {
    return url;
  }
}

/** pg-boss schema: PGBOSS_SCHEMA, else "<db schema>_jobs" (or "accounts_hub_jobs" when on public). */
export function jobsSchema(url = process.env.DATABASE_URL ?? ""): string {
  if (process.env.PGBOSS_SCHEMA) return process.env.PGBOSS_SCHEMA;
  const s = dbSchema(url);
  return s === "public" ? "accounts_hub_jobs" : `${s}_jobs`;
}

/** libpq startup option that puts the app's schema first on the search path (raw SQL then needs no schema prefix). */
export function searchPathOption(schema: string): string {
  const safe = schema.replace(/"/g, "");
  return safe === "public" ? "-c search_path=public" : `-c search_path="${safe}",public`;
}
