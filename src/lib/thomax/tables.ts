/**
 * Thomax (.wms) Query API tables (help page "Using The Query API", shared by Asal 10/11/2026).
 * The list is what we know exists; field names are discovered by Explore, never hard-coded.
 * ATR (attributes) needs an InnerJoin, so it is listed but off by default.
 */

export type ThomaxKind = "TRANSACTIONAL" | "MASTER";

export interface ThomaxTableDef {
  name: string;
  label: string;
  group: string;
  kind: ThomaxKind;
  /** Off by default (needs extra parameters, or not useful as a copy) */
  off?: boolean;
}

export const THOMAX_TABLES: ReadonlyArray<ThomaxTableDef> = [
  // Outbound
  { name: "PCK", label: "Packing jobs (orders)", group: "Outbound", kind: "TRANSACTIONAL" },
  { name: "PCK1", label: "Order lines", group: "Outbound", kind: "TRANSACTIONAL" },
  { name: "PCK2", label: "Outbound logistic units", group: "Outbound", kind: "TRANSACTIONAL" },
  { name: "PCK3", label: "Outbound logistic unit lines", group: "Outbound", kind: "TRANSACTIONAL" },
  { name: "PCK4", label: "Pick lines", group: "Outbound", kind: "TRANSACTIONAL" },
  { name: "WVE", label: "Waves", group: "Outbound", kind: "TRANSACTIONAL" },
  // Consignments
  { name: "CON", label: "Consignments", group: "Consignments", kind: "TRANSACTIONAL" },
  { name: "CON1", label: "Consignment lines", group: "Consignments", kind: "TRANSACTIONAL" },
  { name: "CON2", label: "Consignment articles", group: "Consignments", kind: "TRANSACTIONAL" },
  { name: "CON3", label: "Consignment status history", group: "Consignments", kind: "TRANSACTIONAL" },
  { name: "CON4", label: "Dangerous goods", group: "Consignments", kind: "TRANSACTIONAL" },
  { name: "CON5", label: "Consignment contents", group: "Consignments", kind: "TRANSACTIONAL" },
  { name: "MAN", label: "Freight manifests", group: "Consignments", kind: "TRANSACTIONAL" },
  // Inbound
  { name: "RCP", label: "Receipt jobs", group: "Inbound", kind: "TRANSACTIONAL" },
  { name: "RCPE", label: "Receipts expected (ASN)", group: "Inbound", kind: "TRANSACTIONAL" },
  { name: "RCPA", label: "Receipts actual", group: "Inbound", kind: "TRANSACTIONAL" },
  // Stock units
  { name: "ULD", label: "Logistic units (pallets, cartons)", group: "Stock units", kind: "TRANSACTIONAL" },
  { name: "ULD1", label: "Logistic unit lines", group: "Stock units", kind: "TRANSACTIONAL" },
  { name: "ULDB", label: "Logistic unit ↔ bin links", group: "Stock units", kind: "TRANSACTIONAL" },
  { name: "ULDL", label: "Logistic unit history (movements)", group: "Stock units", kind: "TRANSACTIONAL" },
  // People and activity
  { name: "ACT", label: "Timed activities", group: "People & activity", kind: "TRANSACTIONAL" },
  { name: "USR", label: "WMS users", group: "People & activity", kind: "MASTER" },
  // Master data
  { name: "TNT", label: "Tenants (clients)", group: "Master data", kind: "MASTER" },
  { name: "WHS", label: "Warehouses", group: "Master data", kind: "MASTER" },
  { name: "BIN", label: "Bins", group: "Master data", kind: "MASTER" },
  { name: "LOC", label: "Cross-dock locations", group: "Master data", kind: "MASTER" },
  { name: "ITM", label: "Items (SKUs)", group: "Master data", kind: "MASTER" },
  { name: "ITM1", label: "Item trade units", group: "Master data", kind: "MASTER" },
  { name: "ITMA", label: "Item attributes", group: "Master data", kind: "MASTER" },
  { name: "ITMW", label: "Item warehouse settings", group: "Master data", kind: "MASTER" },
  { name: "CIT", label: "Composite items (kits)", group: "Master data", kind: "MASTER" },
  { name: "CIT1", label: "Composite item lines", group: "Master data", kind: "MASTER" },
  { name: "CAR", label: "Carriers", group: "Master data", kind: "MASTER" },
  { name: "CAR1", label: "Carrier services", group: "Master data", kind: "MASTER" },
  // Needs InnerJoin=…
  { name: "ATR", label: "Attributes (needs a join — not copied)", group: "Other", kind: "TRANSACTIONAL", off: true },
];

export const THOMAX_TABLE_NAMES = THOMAX_TABLES.map((t) => t.name);

export function tableDef(name: string): ThomaxTableDef | undefined {
  return THOMAX_TABLES.find((t) => t.name === name);
}
