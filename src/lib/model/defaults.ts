import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Starting structure of the cost model (brief §6) — names and drivers only, no amounts. Amounts come from Xero,
 * payroll and the WMS. Created once if missing; never overwrites what was edited in Settings.
 */
export const DEFAULT_SITES = [
  { key: "smi", name: "Smithfield", wmsCodes: ["SYD02"] as string[], owned: false, labourUtil: 0.85, spaceUtil: 0.9, sortOrder: 1 },
  // Owned: no rent in Xero → notional rent set in Settings. Space ~100% used (Asal, 10/2026).
  { key: "par", name: "Parramatta", wmsCodes: ["SYD01"], owned: true, labourUtil: 0.85, spaceUtil: 1, sortOrder: 2 },
];

export const DEFAULT_POOLS = [
  { key: "floor_smi", name: "Floor staff · Smithfield", kind: "LABOUR", site: "smi", driver: "MINUTES", description: "Pickers, packers, receivers, forklift — gross + super + payroll tax + workers comp, plus agency labour for the site" },
  { key: "floor_par", name: "Floor staff · Parramatta", kind: "LABOUR", site: "par", driver: "MINUTES", description: "As above, Parramatta" },
  { key: "csr", name: "Customer service (CSR)", kind: "LABOUR", site: null, driver: "MINUTES", description: "Front tickets × minutes" },
  { key: "admin", name: "Admin & management", kind: "OVERHEAD", site: null, driver: "LABOUR_MINUTES", description: "Office, management, accounts — per labour minute (rule G still open)" },
  { key: "rent_smi", name: "Rent · Smithfield", kind: "OVERHEAD", site: "smi", driver: "PALLET_WEEKS", description: "Rent and outgoings (rule D: maybe by space type)" },
  { key: "rent_par", name: "Notional rent · Parramatta", kind: "OVERHEAD", site: "par", driver: "PALLET_WEEKS", description: "Owned site — notional rent from Settings → Rules → Sites" },
  { key: "equip", name: "Equipment", kind: "OVERHEAD", site: null, driver: "PALLET_MOVES", description: "Forklifts, high reach, order pickers, racking" },
  { key: "automation_cmc", name: "Automation · CMC CartonWrap", kind: "OVERHEAD", site: null, driver: "MACHINE_ORDERS", description: "Lease, service, cartons — orders that go through the machine (rule F still open)" },
  { key: "automation_sort", name: "Automation · Opex Sure Sort", kind: "OVERHEAD", site: null, driver: "MACHINE_ORDERS", description: "Orders that go through the sorter" },
  { key: "packaging", name: "Packaging materials", kind: "OVERHEAD", site: null, driver: "ORDERS_PACKED", description: "Per order packed (rule H: actual per client — open)" },
  { key: "software", name: "Software & systems", kind: "OVERHEAD", site: null, driver: "ORDERS", description: "WMS, Dyspatch, subscriptions" },
] as const;

export async function ensureModelDefaults(db: PrismaClient): Promise<number> {
  let added = 0;
  for (const [i, s] of DEFAULT_SITES.entries()) {
    if (await db.site.findUnique({ where: { key: s.key }, select: { key: true } })) continue;
    await db.site.create({ data: { ...s, sortOrder: s.sortOrder ?? i } });
    added++;
  }
  for (const [i, p] of DEFAULT_POOLS.entries()) {
    if (await db.costPool.findUnique({ where: { key: p.key }, select: { key: true } })) continue;
    await db.costPool.create({ data: { ...p, kind: p.kind as "LABOUR" | "OVERHEAD", sortOrder: i } });
    added++;
  }
  return added;
}
