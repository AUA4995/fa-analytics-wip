import { prisma } from "@/lib/db";
import { addMonth } from "./load";
import { breakEvenStd, type Behaviour, type BreakEvenStd } from "./breakeven-std";

/** Loads 12 months of P&L rows (ending at `lastMonth`) and each account's behaviour, then runs the standard method. */
export async function loadBreakEven(lastMonth: string, avgMonths: string[], ordersPerMonth: number | null): Promise<BreakEvenStd | null> {
  const first = addMonth(lastMonth, -11);
  const [rows, types, maps] = await Promise.all([
    prisma.xeroPnl.findMany({ where: { month: { gte: first, lte: lastMonth } } }),
    prisma.xeroAccount.findMany({ select: { xeroId: true, type: true } }),
    prisma.xeroAccountMap.findMany({ where: { behaviour: { not: null } }, select: { accountCode: true, behaviour: true } }),
  ]);
  const typeOf = new Map(types.map((t) => [t.xeroId, t.type]));
  const behaviour: Record<string, Behaviour> = {};
  for (const m of maps) if (m.behaviour && ["FIXED", "VARIABLE", "SEMI", "STEP"].includes(m.behaviour)) behaviour[m.accountCode] = m.behaviour as Behaviour;
  return breakEvenStd(
    rows.map((r) => ({ month: r.month, accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, section: r.section, amount: Number(r.amount), type: typeOf.get(r.accountId) ?? null })),
    avgMonths,
    behaviour,
    ordersPerMonth,
  );
}
