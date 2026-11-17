"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertAdmin, assertUser } from "@/lib/auth/session";
import { logChange } from "@/lib/model/store";
import { createTask } from "@/lib/tasks";
import { parseCsv } from "@/lib/model/csv";
import { parseWmsDate } from "@/lib/wms/import";

export type LeakState = { ok: boolean; message: string };
const actor = (u: { name: string }) => ({ type: "USER" as const, name: u.name });
const done = () => {
  revalidatePath("/leakage");
  revalidatePath("/tasks");
  revalidatePath("/");
};

export async function runDetectionAction(): Promise<LeakState> {
  try {
    const me = await assertAdmin();
    const d = await import("@/lib/leakage/detect");
    const r = await d.runDetection(d.recentMonths(3), me.name);
    done();
    return { ok: true, message: `Checked the last 3 months: ${r.found} findings (${r.added} new, ${r.removed} no longer there).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Create a task to fix it by hand (the app never changes Xero, Dyspach or the WMS). */
export async function leakTaskAction(id: string, owner: string): Promise<LeakState> {
  const me = await assertUser();
  const l = await prisma.leakageItem.findUniqueOrThrow({ where: { id } });
  const c = await prisma.client.findUnique({ where: { id: l.clientId } });
  await createTask({
    title: l.kind === "WEEKLY_MINIMUM" ? `Bill the weekly minimum top-up · ${c?.name} · ${l.period}` : `Bill the missing ${l.serviceCode ?? "services"} · ${c?.name} · ${l.period}`,
    detail: l.working,
    where: "Xero",
    link: "https://go.xero.com/AccountsReceivable/",
    clientId: l.clientId,
    owner: owner || null,
    priority: Number(l.gap) >= 500 ? "High" : "Normal",
    source: `leakage:${id}`,
  });
  await prisma.leakageItem.update({ where: { id }, data: { status: "TASK", owner: owner || l.owner } });
  await logChange({ entity: "leakage", entityId: id, field: "status", oldValue: l.status, newValue: "TASK", actor: actor(me) });
  done();
  return { ok: true, message: "Task created." };
}

export async function leakExplainAction(id: string, cause: string): Promise<LeakState> {
  const me = await assertUser();
  if (!cause.trim()) return { ok: false, message: "Say why it isn't leakage." };
  const l = await prisma.leakageItem.findUniqueOrThrow({ where: { id } });
  await prisma.leakageItem.update({ where: { id }, data: { status: "EXPLAINED", cause: cause.trim() } });
  await logChange({ entity: "leakage", entityId: id, field: "status", oldValue: l.status, newValue: "EXPLAINED", actor: actor(me), reason: cause.trim() });
  done();
  return { ok: true, message: "Marked as explained." };
}

const Rec = z.object({ amount: z.coerce.number().positive(), invoice: z.string().trim().min(2).max(40), date: z.string().trim().min(8) });
export async function leakRecoveredAction(id: string, raw: { amount: string; invoice: string; date: string }): Promise<LeakState> {
  const me = await assertUser();
  const p = Rec.safeParse(raw);
  if (!p.success) return { ok: false, message: "Enter the amount billed, the Xero invoice number and the date (DD/MM/YYYY)." };
  const iso = parseWmsDate(p.data.date);
  if (!iso) return { ok: false, message: "Date: DD/MM/YYYY" };
  const l = await prisma.leakageItem.findUniqueOrThrow({ where: { id } });
  await prisma.leakageItem.update({ where: { id }, data: { status: "RECOVERED", recoveredAmount: p.data.amount, recoveredInvoice: p.data.invoice, recoveredOn: new Date(iso + "T00:00:00Z"), recoveredBy: me.name } });
  await prisma.task.updateMany({ where: { source: `leakage:${id}`, status: { not: "DONE" } }, data: { status: "DONE", doneAt: new Date(), doneBy: me.name, doneNote: `Recovered on ${p.data.invoice}` } });
  await logChange({ entity: "leakage", entityId: id, field: "status", oldValue: l.status, newValue: "RECOVERED", actor: actor(me), reason: `${p.data.invoice} · $${p.data.amount}` });
  done();
  return { ok: true, message: "Recorded as recovered." };
}

export async function leakReopenAction(id: string): Promise<LeakState> {
  const me = await assertAdmin();
  const l = await prisma.leakageItem.findUniqueOrThrow({ where: { id } });
  await prisma.leakageItem.update({ where: { id }, data: { status: "OPEN" } });
  await logChange({ entity: "leakage", entityId: id, field: "status", oldValue: l.status, newValue: "OPEN", actor: actor(me) });
  done();
  return { ok: true, message: "Reopened." };
}

/**
 * Import FA_Leakage_Log (saved as CSV): found date, client, service, type, amount, status, recovered amount,
 * recovered invoice, recovered date, cause, owner. Rows become log entries (marked imported); nothing is detected from them.
 */
export async function importLeakLogAction(text: string): Promise<LeakState> {
  const me = await assertAdmin();
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, message: "Paste the header row and at least one row." };
  const h = rows[0].map((x) => x.toLowerCase().trim());
  const c = (names: string[]) => h.findIndex((x) => names.includes(x));
  const idx = { date: c(["date", "found", "date found", "found on"]), client: c(["client", "customer"]), service: c(["service", "service code", "code", "charge"]), type: c(["type", "kind"]), amount: c(["amount", "gap", "$", "value"]), status: c(["status"]), rec: c(["recovered", "recovered amount"]), inv: c(["invoice", "recovered invoice", "xero invoice"]), recDate: c(["recovered date", "recovered on"]), cause: c(["cause", "notes", "reason"]), owner: c(["owner", "who"]) };
  if (idx.client < 0 || idx.amount < 0) return { ok: false, message: "Need at least the client and amount columns." };
  const clients = await prisma.client.findMany({ select: { id: true, name: true, shortName: true } });
  let added = 0;
  const missing = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cname = (r[idx.client] ?? "").trim();
    const cl = clients.find((x) => x.name.toLowerCase() === cname.toLowerCase() || x.shortName?.toLowerCase() === cname.toLowerCase());
    if (!cl) {
      missing.add(cname);
      continue;
    }
    const amount = Number((r[idx.amount] ?? "").replace(/[$,\s]/g, "")) || 0;
    const found = idx.date >= 0 ? parseWmsDate(r[idx.date] ?? "") : null;
    const st = (idx.status >= 0 ? r[idx.status] : "").toLowerCase();
    const status = /recover/.test(st) ? "RECOVERED" : /explain/.test(st) ? "EXPLAINED" : /task/.test(st) ? "TASK" : "OPEN";
    const recDate = idx.recDate >= 0 ? parseWmsDate(r[idx.recDate] ?? "") : null;
    const key = `IMPORT|${cl.id}|${i}|${found ?? ""}|${amount}`;
    if (await prisma.leakageItem.findUnique({ where: { key } })) continue;
    await prisma.leakageItem.create({
      data: {
        key,
        kind: /rate/i.test(idx.type >= 0 ? r[idx.type] : "") ? "RATE_MISMATCH" : /min/i.test(idx.type >= 0 ? r[idx.type] : "") ? "WEEKLY_MINIMUM" : "UNDER_BILLING",
        clientId: cl.id,
        serviceCode: idx.service >= 0 ? r[idx.service] || null : null,
        period: (found ?? new Date().toISOString().slice(0, 10)).slice(0, 7),
        expected: amount,
        billed: 0,
        gap: amount,
        working: "Imported from FA_Leakage_Log",
        status,
        cause: idx.cause >= 0 ? r[idx.cause] || null : null,
        owner: idx.owner >= 0 ? r[idx.owner] || null : null,
        foundOn: found ? new Date(found + "T00:00:00Z") : new Date(),
        recoveredAmount: idx.rec >= 0 && r[idx.rec] ? Number(r[idx.rec].replace(/[$,\s]/g, "")) || null : null,
        recoveredInvoice: idx.inv >= 0 ? r[idx.inv] || null : null,
        recoveredOn: recDate ? new Date(recDate + "T00:00:00Z") : null,
        imported: true,
      },
    });
    added++;
  }
  await logChange({ entity: "leakage", entityId: "import", field: "_imported", oldValue: null, newValue: { rows: rows.length - 1, added }, actor: actor(me) });
  done();
  return { ok: !missing.size, message: `${added} rows imported.${missing.size ? ` Clients not found (add them in Settings → Clients first): ${[...missing].slice(0, 8).join(", ")}` : ""}` };
}
