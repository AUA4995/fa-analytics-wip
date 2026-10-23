import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/model/csv";

/**
 * Rate checks (brief §7): the same client rate as CLM (or Settings until CLM connects), Dyspatch and the WMS hold it.
 * The app only shows match / don't match; a person decides which is right; fixing another system is a task done by
 * hand. Dyspatch and WMS rates arrive as uploaded exports until their APIs are available.
 */

export type RateSource = "DYSPATCH" | "WMS";

export interface RateUploadPlan {
  rows: number;
  saved: Array<{ clientId: string; serviceCode: string; rate: number }>;
  unknownClients: string[];
  unknownCodes: string[];
  errors: Array<{ line: number; message: string }>;
}

const H = { client: ["tenant", "tenant id", "customer id", "client id", "client", "customer"], code: ["charge code", "code", "service code", "rate code", "charge"], rate: ["rate", "sell rate", "price", "amount", "unit rate"] };

export async function planRateUpload(source: RateSource, text: string): Promise<RateUploadPlan> {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const ci = col(H.client), ki = col(H.code), ri = col(H.rate);
  const plan: RateUploadPlan = { rows: Math.max(0, rows.length - 1), saved: [], unknownClients: [], unknownCodes: [], errors: [] };
  if (ci < 0 || ki < 0 || ri < 0) {
    plan.errors.push({ line: 1, message: `Need columns for client / tenant ID (${H.client[0]}), charge code (${H.code[0]}) and rate (${H.rate[0]})` });
    return plan;
  }
  const [clients, services, maps] = await Promise.all([prisma.client.findMany(), prisma.service.findMany({ select: { code: true } }), prisma.wmsCodeMap.findMany()]);
  const codes = new Set(services.map((s) => s.code));
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = (r[ci] ?? "").trim();
    const code = (r[ki] ?? "").trim();
    const rate = Number((r[ri] ?? "").replace(/[$,\s]/g, ""));
    if (!id || !code || !Number.isFinite(rate)) {
      plan.errors.push({ line: i + 1, message: "Client, code or rate missing / not a number" });
      continue;
    }
    const c = clients.find((x) => [x.dyspatchCustomerId, x.thomaxTenantId, x.logiwaClientId, x.p3lClientId, x.name].includes(id));
    if (!c) {
      if (!plan.unknownClients.includes(id)) plan.unknownClients.push(id);
      continue;
    }
    const svc = codes.has(code.toUpperCase()) ? code.toUpperCase() : (maps.find((m) => m.wmsCode === code && (m.tenant === id || m.tenant === ""))?.serviceCode ?? null);
    if (!svc) {
      if (!plan.unknownCodes.includes(code)) plan.unknownCodes.push(code);
      continue;
    }
    const k = `${c.id}|${svc}`;
    if (seen.has(k)) continue; // per-carrier duplicates of one service: the first wins (they should match anyway)
    seen.add(k);
    plan.saved.push({ clientId: c.id, serviceCode: svc, rate });
  }
  return plan;
}

export async function saveRateUpload(source: RateSource, plan: RateUploadPlan, fileName: string | null, asOf: Date): Promise<number> {
  for (const s of plan.saved) await prisma.rateSnapshot.upsert({ where: { source_clientId_serviceCode: { source, clientId: s.clientId, serviceCode: s.serviceCode } }, update: { rate: s.rate, asOf, fileName }, create: { source, clientId: s.clientId, serviceCode: s.serviceCode, rate: s.rate, asOf, fileName } });
  return plan.saved.length;
}

export interface RateCheckRow {
  clientId: string;
  clientName: string;
  serviceCode: string;
  serviceName: string;
  clm: number | null;
  clmSource: string | null;
  dyspatch: number | null;
  wms: number | null;
  match: boolean;
}

export const same = (a: number | null, b: number | null) => a == null || b == null || Math.abs(a - b) < 0.005;

export async function rateChecks(): Promise<RateCheckRow[]> {
  const [rates, snaps, clients, services] = await Promise.all([prisma.clientRate.findMany(), prisma.rateSnapshot.findMany(), prisma.client.findMany({ select: { id: true, name: true, shortName: true } }), prisma.service.findMany({ select: { code: true, name: true } })]);
  const keys = new Set([...rates.map((r) => `${r.clientId}|${r.serviceCode}`), ...snaps.map((s) => `${s.clientId}|${s.serviceCode}`)]);
  const rows: RateCheckRow[] = [];
  for (const k of keys) {
    const [clientId, serviceCode] = k.split("|");
    const r = rates.find((x) => x.clientId === clientId && x.serviceCode === serviceCode);
    const d = snaps.find((x) => x.source === "DYSPATCH" && x.clientId === clientId && x.serviceCode === serviceCode);
    const w = snaps.find((x) => x.source === "WMS" && x.clientId === clientId && x.serviceCode === serviceCode);
    const clm = r ? Number(r.rate) : null;
    const dy = d ? Number(d.rate) : null;
    const wm = w ? Number(w.rate) : null;
    const c = clients.find((x) => x.id === clientId);
    rows.push({ clientId, clientName: c?.shortName || c?.name || clientId, serviceCode, serviceName: services.find((s) => s.code === serviceCode)?.name ?? serviceCode, clm, clmSource: r?.source ?? null, dyspatch: dy, wms: wm, match: same(clm, dy) && same(clm, wm) && same(dy, wm) });
  }
  return rows.sort((a, b) => Number(a.match) - Number(b.match) || a.clientName.localeCompare(b.clientName));
}
