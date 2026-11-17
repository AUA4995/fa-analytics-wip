import { prisma } from "@/lib/db";

/**
 * Can leakage be found yet? (batch 2 review) A "0" must never read as "checked, nothing wrong" while the inputs
 * aren't there: client rates, Xero sales and WMS volumes for under-billing; rates plus a Dyspach or WMS rate export
 * for rate checks; and a detection run since the data arrived.
 */
export async function leakageInputs(): Promise<{ canDetect: boolean; canCompare: boolean; ran: boolean; missing: string; hasRates: boolean }> {
  const [rates, sales, vols, ords, snaps, run] = await Promise.all([
    prisma.clientRate.count(),
    prisma.xeroSale.count(),
    prisma.volumeLine.count(),
    prisma.orderFact.count(),
    prisma.rateSnapshot.count(),
    prisma.leakageItem.count(),
  ]);
  const missing = [!rates && "client rates (CLM / Settings → Clients)", !sales && "Xero sales", !(vols + ords) && "WMS volumes"].filter(Boolean).join(", ");
  return { canDetect: rates > 0 && sales > 0 && vols + ords > 0, canCompare: rates > 0 && snaps > 0, ran: run > 0, missing, hasRates: rates > 0 };
}
