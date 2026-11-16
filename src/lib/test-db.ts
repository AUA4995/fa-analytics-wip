/**
 * Integration tests delete and rewrite data, so they only run against a database whose name ends in "_test"
 * (e.g. fa_analytics_test). Pointed at the real database (DATABASE_URL = …/fa_analytics), they are skipped.
 */
export function isTestDatabase(url = process.env.DATABASE_URL): boolean {
  if (!url) return false;
  try {
    return /_test$/.test(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return false;
  }
}
