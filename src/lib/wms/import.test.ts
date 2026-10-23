import { describe, expect, it } from "vitest";
import { guessMapping, parseWmsDate } from "./import";
import { lastMonths, monthRange, ticketQuery } from "@/lib/front/tickets";

describe("WMS files", () => {
  it("reads AU and ISO dates and rejects impossible ones", () => {
    expect(parseWmsDate("03/09/2026")).toBe("2026-09-03");
    expect(parseWmsDate("3/9/26 14:05")).toBe("2026-09-03");
    expect(parseWmsDate("2026-09-03T10:00:00")).toBe("2026-09-03");
    expect(parseWmsDate("31/02/2026")).toBeNull();
    expect(parseWmsDate("09-2026")).toBeNull();
  });
  it("guesses columns from common header names", () => {
    expect(guessMapping("CHARGES", ["Charge Date", "Tenant ID", "Charge Code", "Qty", "Warehouse"])).toEqual({ date: 0, tenant: 1, wmsCode: 2, quantity: 3, warehouse: 4 });
    expect(guessMapping("ORDERS", ["Order Number", "Dispatch Date", "Client", "SKU", "Quantity"])).toMatchObject({ orderRef: 0, date: 1, tenant: 2, sku: 3, units: 4, skus: null });
  });
});

describe("Front ticket counts", () => {
  it("month ranges and search query", () => {
    expect(monthRange("2026-09")).toEqual({ after: Date.UTC(2026, 8, 1) / 1000, before: Date.UTC(2026, 9, 1) / 1000 });
    expect(lastMonths(2, new Date("2026-10-23T00:00:00Z"))).toEqual(["2026-10", "2026-09"]);
    expect(ticketQuery(["example-kora.com"], "2026-09")).toBe(`from:@example-kora.com after:${Date.UTC(2026, 8, 1) / 1000} before:${Date.UTC(2026, 9, 1) / 1000}`);
    expect(ticketQuery(["a.com", "b.com"], "2026-09")).toMatch(/^\(from:@a\.com OR from:@b\.com\) after:/);
  });
});
