/** The history load runs 20:00–05:59 Sydney time (Power BI and the daily ops emails use Thomax by day). */
export function thomaxWindowOpen(now: Date): boolean {
  const h = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", hourCycle: "h23" }).format(now));
  return h >= 20 || h < 6;
}
