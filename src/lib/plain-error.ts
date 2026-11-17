/**
 * Error text that is safe to show in the browser (security review): our own errors are written in plain words and are
 * shown as they are; database and other internal errors (table / column names, SQL) are logged on the server and
 * replaced by a plain message.
 */
const INTERNAL = /prisma|invalid `|\bP\d{4}\b|relation "|column "|violates|duplicate key|ECONNREFUSED|syntax error|at [\w.]+ \(/i;

export function plainError(err: unknown, opts: { log?: boolean } = {}): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (/^Prisma/.test(name) || INTERNAL.test(msg)) {
    if (opts.log !== false) console.error("[internal error]", err);
    return "Something went wrong on the server (details are in the app's log). Try again; if it keeps happening, send the time it happened to Claude.";
  }
  return msg;
}
