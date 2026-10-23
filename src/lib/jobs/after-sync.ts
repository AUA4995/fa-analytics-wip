/**
 * Runs after every sync / import: what's new (notifications), leakage for the last 3 months, re-check snoozed tasks.
 * Each step is independent — one failing never stops the others.
 */
export async function afterSync(by: string | null = null): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (err) {
      out[name] = `failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[after-sync] ${name}:`, err);
    }
  };
  await step("notifications", async () => (await import("@/lib/tasks/notices")).generateNotifications());
  await step("leakage", async () => {
    const d = await import("@/lib/leakage/detect");
    return d.runDetection(d.recentMonths(3), by);
  });
  await step("tasks", async () => (await import("@/lib/tasks")).recheckTasks());
  return out;
}
