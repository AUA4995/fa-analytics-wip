import { describe, expect, it } from "vitest";
import { DEFAULT_TICKET_TYPES, UNCLASSIFIED, classify, durationMultiplier, lastWeeks, scoreTickets, vsAverage, weekOf, type TypeDef } from "./score";

const types: TypeDef[] = [
  { name: "Damage claim", department: "SUPPORT", weight: 7, tags: ["Damage"] },
  { name: "Billing dispute", department: "ACCOUNTS", weight: 8, tags: ["Accounts > Dispute", "dispute"] },
  { name: UNCLASSIFIED, department: "SUPPORT", weight: 3, tags: [] },
];
const d = (s: string) => new Date(s);

describe("weighted tickets", () => {
  it("duration: ×1 in the first week, +25% per extra started week, capped at ×3", () => {
    expect(durationMultiplier(0)).toBe(1);
    expect(durationMultiplier(0.5)).toBe(1);
    expect(durationMultiplier(1)).toBe(1);
    expect(durationMultiplier(1.01)).toBe(1.25);
    expect(durationMultiplier(3)).toBe(1.5);
    expect(durationMultiplier(20)).toBe(3);
    expect(durationMultiplier(5, { weekStep: 0.5, maxMultiplier: 2 })).toBe(2);
  });
  it("classifies by the first type whose Front tag it carries (case-insensitive); else Unclassified", () => {
    expect(classify(["damage"], types)?.name).toBe("Damage claim");
    expect(classify(["DISPUTE", "Damage"], types)?.name).toBe("Damage claim");
    expect(classify(["Other"], types)?.name).toBe(UNCLASSIFIED);
    expect(classify([], types.slice(0, 2))).toBeNull();
  });
  it("scores weight × duration and splits support / accounts", () => {
    const now = d("2026-11-16T00:00:00Z");
    const s = scoreTickets(
      [
        { tags: ["Damage"], createdAt: d("2026-11-09T00:00:00Z"), closedAt: d("2026-11-10T00:00:00Z") }, // 7 × 1
        { tags: ["dispute"], createdAt: d("2026-10-26T00:00:00Z"), closedAt: null }, // 3 weeks open → 8 × 1.5
        { tags: [], createdAt: d("2026-11-15T00:00:00Z"), closedAt: null }, // 3 × 1
      ],
      types,
      now,
    );
    expect(s).toEqual({ tickets: 3, score: 22, supportScore: 10, accountsScore: 12, byType: { "Damage claim": 1, "Billing dispute": 1, [UNCLASSIFIED]: 1 } });
  });
  it("weeks are Sydney Mondays; last full weeks newest first", () => {
    expect(weekOf(d("2026-11-15T14:00:00Z"))).toBe("2026-11-16"); // Monday 01:00 AEDT
    expect(weekOf(d("2026-11-15T12:00:00Z"))).toBe("2026-11-09"); // Sunday 23:00 AEDT
    expect(lastWeeks(2, d("2026-11-18T00:00:00Z"))).toEqual(["2026-11-09", "2026-11-02"]);
  });
  it("vs average: 1 = the average client with tickets", () => {
    expect(vsAverage({ a: 10, b: 30, c: 0 })).toEqual({ a: 0.5, b: 1.5, c: 0 });
    expect(vsAverage({ a: 0 })).toEqual({ a: null });
  });
  it("the starting list has weights 1–10, every department, and an Unclassified catch-all", () => {
    for (const t of DEFAULT_TICKET_TYPES) expect(t.weight >= 1 && t.weight <= 10).toBe(true);
    expect(new Set(DEFAULT_TICKET_TYPES.map((t) => t.department))).toEqual(new Set(["SUPPORT", "ACCOUNTS", "WAREHOUSE", "SALES"]));
    expect(DEFAULT_TICKET_TYPES.some((t) => t.name === UNCLASSIFIED)).toBe(true);
  });
});
