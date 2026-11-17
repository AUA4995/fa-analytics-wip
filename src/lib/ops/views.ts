import { addState, dispatchDue, emptyCount, mondayOf, receivingDue, sameWeekdayOutlook, slaState, ymdUtc, type OpsRules, type SlaCount, type SlaState } from "./calc";
import { flowReady, type FlowKey, type OpsConfig } from "./config";
import { dailyCounts, firstDay, loadFlow, type FlowFilter, type FlowRow } from "./load";

/** View models for Operations → SLA, Receiving, Trends (batch 5). */

export interface Item {
  tenant: string;
  ref: string | null;
  type: string | null;
  created: Date;
  due: Date;
  done: Date | null;
  state: SlaState;
}

export interface SlaBlock {
  ready: boolean;
  total: SlaCount;
  byTenant: Array<{ tenant: string; c: SlaCount }>;
  /** Late and overdue, oldest due first (max 200) */
  problems: Item[];
  capped: boolean;
}

const DAY = 86_400_000;

function block(rows: FlowRow[], dueOf: (r: FlowRow) => Date, now: Date, capped: boolean): SlaBlock {
  const total = emptyCount();
  const by = new Map<string, SlaCount>();
  const problems: Item[] = [];
  for (const r of rows) {
    const due = dueOf(r);
    const state = slaState(due, r.done, now);
    addState(total, state);
    const c = by.get(r.tenant) ?? emptyCount();
    addState(c, state);
    by.set(r.tenant, c);
    if (state === "LATE" || state === "OVERDUE") problems.push({ tenant: r.tenant, ref: r.ref, type: r.type, created: r.created, due, done: r.done, state });
  }
  problems.sort((a, b) => a.due.getTime() - b.due.getTime());
  return {
    ready: true,
    total,
    byTenant: [...by.entries()].map(([tenant, c]) => ({ tenant, c })).sort((a, b) => b.c.total - a.c.total),
    problems: problems.slice(0, 200),
    capped,
  };
}

const notReady = (): SlaBlock => ({ ready: false, total: emptyCount(), byTenant: [], problems: [], capped: false });

export function isB2B(type: string | null, b2bValues: readonly string[]): boolean {
  if (!type || !b2bValues.length) return false;
  const t = type.trim().toLowerCase();
  return b2bValues.some((v) => v.trim().toLowerCase() === t);
}

export async function slaView(cfg: OpsConfig, from: Date, to: Date, filter: FlowFilter, now: Date): Promise<{ dispatch: SlaBlock; receiving: SlaBlock }> {
  const rules: OpsRules = cfg.rules;
  const holidays = new Set(rules.holidays);
  const dispatch = flowReady(cfg, "dispatch")
    ? await loadFlow(cfg.flows.dispatch, from, to, filter).then((x) => block(x.rows, (r) => dispatchDue(r.created, isB2B(r.type, cfg.b2bValues), rules, holidays), now, x.capped))
    : notReady();
  const receiving = flowReady(cfg, "receiving") ? await loadFlow(cfg.flows.receiving, from, to, filter).then((x) => block(x.rows, (r) => receivingDue(r.created, rules), now, x.capped)) : notReady();
  return { dispatch, receiving };
}

export interface ReceivingView {
  ready: Record<"receiving" | "expected", boolean>;
  /** Per client: expected (ASN) in the period, arrived, received, still open, received late */
  byTenant: Array<{ tenant: string; expected: number; arrived: number; received: number; open: number; late: number }>;
  /** Per receipt type (if the type field is set): arrived / received */
  byType: Array<{ type: string; arrived: number; received: number }>;
  /** Waiting longer than the target now, arrived in the last 60 days, oldest first (up to 200 shown) */
  waiting: Item[];
  /** How many are waiting in total (the list above is cut at 200) */
  waitingCount: number;
  /** Expected in the period with no matching receipt yet are not matched line by line (Thomax link fields unknown) */
  capped: boolean;
}

export async function receivingView(cfg: OpsConfig, from: Date, to: Date, filter: FlowFilter, now: Date): Promise<ReceivingView> {
  const ready = { receiving: flowReady(cfg, "receiving"), expected: flowReady(cfg, "expected") };
  const by = new Map<string, { tenant: string; expected: number; arrived: number; received: number; open: number; late: number }>();
  const get = (t: string) => by.get(t) ?? by.set(t, { tenant: t, expected: 0, arrived: 0, received: 0, open: 0, late: 0 }).get(t)!;
  const types = new Map<string, { type: string; arrived: number; received: number }>();
  let capped = false;
  if (ready.expected) {
    const e = await loadFlow(cfg.flows.expected, from, to, filter);
    capped ||= e.capped;
    for (const r of e.rows) get(r.tenant).expected++;
  }
  const waiting: Item[] = [];
  if (ready.receiving) {
    const a = await loadFlow(cfg.flows.receiving, from, to, filter);
    capped ||= a.capped;
    for (const r of a.rows) {
      const g = get(r.tenant);
      g.arrived++;
      const due = receivingDue(r.created, cfg.rules);
      if (r.done) g.received++;
      else g.open++;
      if (r.done && r.done >= due) g.late++;
      const ty = r.type?.trim() || "(not given)";
      const tt = types.get(ty) ?? types.set(ty, { type: ty, arrived: 0, received: 0 }).get(ty)!;
      tt.arrived++;
      if (r.done) tt.received++;
    }
    // "Waiting now" is about today, whatever period is chosen
    const recent = await loadFlow(cfg.flows.receiving, new Date(now.getTime() - 60 * DAY), new Date(now.getTime() + DAY), filter);
    capped ||= recent.capped;
    for (const r of recent.rows) {
      if (r.done) continue;
      const due = receivingDue(r.created, cfg.rules);
      if (now >= due) waiting.push({ tenant: r.tenant, ref: r.ref, type: r.type, created: r.created, due, done: null, state: "OVERDUE" });
    }
    waiting.sort((x, y) => x.created.getTime() - y.created.getTime());
  }
  return {
    ready,
    byTenant: [...by.values()].sort((x, y) => y.arrived + y.expected - (x.arrived + x.expected)),
    byType: [...types.values()].sort((x, y) => y.arrived - x.arrived),
    waiting: waiting.slice(0, 200),
    waitingCount: waiting.length,
    capped,
  };
}

export interface TrendsView {
  ready: boolean;
  weeks: string[];
  /** tenant → counts per week (same order as weeks) */
  rows: Array<{ tenant: string; counts: number[]; total: number }>;
  totals: number[];
  outlook: Array<{ day: Date; value: number | null; basis: number; holiday?: boolean }>;
  firstDay: Date | null;
}

/** Orders per week per client for the last `weeks` full weeks + this week so far, and the next-7-days outlook. */
export async function trendsView(cfg: OpsConfig, flow: FlowKey, filter: FlowFilter, now: Date, weeks = 12): Promise<TrendsView> {
  if (!flowReady(cfg, flow)) return { ready: false, weeks: [], rows: [], totals: [], outlook: [], firstDay: null };
  const thisMon = mondayOf(now);
  const from = new Date(thisMon.getTime() - weeks * 7 * DAY);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY);
  const [counts, first] = await Promise.all([dailyCounts(cfg.flows[flow], from, to, filter), firstDay(cfg.flows[flow], filter)]);
  const weekKeys = Array.from({ length: weeks + 1 }, (_, i) => ymdUtc(new Date(from.getTime() + i * 7 * DAY)));
  const idx = new Map(weekKeys.map((k, i) => [k, i]));
  const byT = new Map<string, number[]>();
  const daily = new Map<string, number>();
  for (const c of counts) {
    const wk = ymdUtc(mondayOf(new Date(`${c.day}T00:00:00Z`)));
    const i = idx.get(wk);
    if (i === undefined) continue;
    const arr = byT.get(c.tenant) ?? byT.set(c.tenant, Array(weekKeys.length).fill(0)).get(c.tenant)!;
    arr[i] += c.n;
    daily.set(c.day, (daily.get(c.day) ?? 0) + c.n);
  }
  const rows = [...byT.entries()].map(([tenant, cs]) => ({ tenant, counts: cs, total: cs.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  const totals = weekKeys.map((_, i) => rows.reduce((s, r) => s + r.counts[i], 0));
  return { ready: true, weeks: weekKeys, rows, totals, outlook: sameWeekdayOutlook(daily, now, { firstDay: first, holidays: new Set(cfg.rules.holidays) }), firstDay: first };
}

export function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}
