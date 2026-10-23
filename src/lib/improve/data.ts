import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { addMonth } from "@/lib/finance/load";
import { getRules } from "@/lib/model/store";
import { DEFAULT_CATEGORIES } from "./calc";

export async function ensureCategories() {
  if (await prisma.improveCategory.count()) return;
  await prisma.improveCategory.createMany({ data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })) });
}

/**
 * Figures the app already has, to prefill the saving blocks (last 3 complete months). Null when there's no data —
 * Asal types it in.
 */
export async function prefill(opts: { supplierContactId?: string | null; itemText?: string | null; site?: string | null } = {}, now = new Date()) {
  const last = addMonth(now.toISOString().slice(0, 7), -1);
  const from = new Date(addMonth(last, -2) + "-01T00:00:00Z");
  const to = new Date(addMonth(last, 1) + "-01T00:00:00Z");
  const sites = await prisma.site.findMany();
  const codes = opts.site ? (sites.find((s) => s.key === opts.site)?.wmsCodes ?? []) : null;
  const orders = await prisma.orderFact.count({ where: { date: { gte: from, lt: to }, ...(codes ? { warehouse: { in: codes } } : {}) } });
  const rules = await getRules();
  const pay = await prisma.$queryRaw<Array<{ gross: number | null; super: number | null; hours: number | null }>>`
    SELECT sum(p.gross)::float AS gross, sum(p.super)::float AS super, sum(p.hours)::float AS hours
    FROM "Payslip" p JOIN "PayRun" r ON r."xeroId" = p."payRunId" JOIN "Staff" s ON s."xeroEmployeeId" = p."employeeId"
    WHERE s.pool = 'floor' AND r."paymentDate" >= ${from} AND r."paymentDate" < ${to} ${opts.site ? Prisma.sql`AND s.site = ${opts.site}` : Prisma.empty}`.catch(() => [{ gross: null, super: null, hours: null }]);
  const p = pay[0];
  const cpm = p?.hours ? ((p.gross ?? 0) * (1 + (rules.payrollTaxRate ?? 0) + (rules.workersCompRate ?? 0)) + (p.super ?? 0)) / (p.hours * 60) : null;
  // Space: rent accounts mapped to rent pools, plus notional rent on owned sites, ÷ pallet positions
  const rentCodes = (await prisma.xeroAccountMap.findMany({ where: { poolKey: { startsWith: "rent" } }, select: { accountCode: true } })).map((r) => r.accountCode);
  const rent = rentCodes.length ? await prisma.xeroPnl.aggregate({ where: { accountCode: { in: rentCodes }, month: { gte: addMonth(last, -2), lte: last } }, _sum: { amount: true } }) : null;
  const notional = sites.reduce((a, s) => a + Number(s.notionalRent ?? 0), 0);
  const positions = sites.reduce((a, s) => a + (s.palletPositions ?? 0), 0);
  const rentMonthly = rent?._sum.amount != null ? Number(rent._sum.amount) / 3 + notional : null;
  // Supplier: average unit price and monthly quantity on that supplier's bills (optionally lines matching a word)
  let supplierPrice: number | null = null;
  let supplierQty: number | null = null;
  if (opts.supplierContactId) {
    const lines = await prisma.xeroBillLine.findMany({ where: { bill: { contactId: opts.supplierContactId, date: { gte: from, lt: to } }, ...(opts.itemText ? { OR: [{ description: { contains: opts.itemText, mode: "insensitive" } }, { itemCode: { contains: opts.itemText, mode: "insensitive" } }] } : {}) }, select: { quantity: true, amount: true } });
    const q = lines.reduce((a, l) => a + Number(l.quantity ?? 0), 0);
    const amt = lines.reduce((a, l) => a + Number(l.amount), 0);
    if (q > 0) {
      supplierPrice = Math.round((amt / q) * 10000) / 10000;
      supplierQty = Math.round(q / 3);
    }
  }
  return {
    ordersPerMonth: orders ? Math.round(orders / 3) : null,
    costPerMinute: cpm != null ? Math.round(cpm * 1000) / 1000 : null,
    costPerPosition: rentMonthly != null && positions ? Math.round((rentMonthly / positions) * 100) / 100 : null,
    supplierPrice,
    supplierQty,
    basis: `last 3 months (${addMonth(last, -2)} to ${last})`,
  };
}
