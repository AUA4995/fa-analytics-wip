import { describe, expect, it } from "vitest";
import { applyChips, chipCounts, chipParam, clearChipsSearch, readChips, toggleChipSearch, type ChipRow } from "./chip-filter";

const data = [
  { id: "1", filter: { priority: "Urgent", area: "Receivables", topic: "Credit request" } },
  { id: "2", filter: { priority: "High", area: "Payables", topic: "Bill on hold" } },
  { id: "3", filter: { priority: "High", area: "Receivables", topic: "Chase overdue" } },
  { id: "4", filter: { priority: "Low", area: "Settings", topic: ["Terms differ", "Chase overdue"] } },
];
const rows: ChipRow[] = [
  { key: "priority", label: "Priority", options: [{ value: "Urgent" }, { value: "High" }, { value: "Medium" }, { value: "Low" }] },
  { key: "area", label: "Area" },
  { key: "topic", label: "Topic", order: "count" },
];

describe("filter chips", () => {
  it("OR within a row, AND across rows", () => {
    expect(applyChips(data, { priority: ["Urgent", "High"] }).map((d) => d.id)).toEqual(["1", "2", "3"]);
    expect(applyChips(data, { priority: ["Urgent", "High"], area: ["Receivables"] }).map((d) => d.id)).toEqual(["1", "3"]);
    expect(applyChips(data, { topic: ["Chase overdue"] }).map((d) => d.id)).toEqual(["3", "4"]);
    expect(applyChips(data, {})).toBe(data);
  });

  it("counts use the other rows' selections; fixed chips keep their order and show 0", () => {
    const g = chipCounts(data, rows, { area: ["Receivables"] });
    expect(g[0].options).toEqual([
      { value: "Urgent", label: "Urgent", count: 1, selected: false },
      { value: "High", label: "High", count: 1, selected: false },
      { value: "Medium", label: "Medium", count: 0, selected: false },
      { value: "Low", label: "Low", count: 0, selected: false },
    ]);
    // the Area row ignores its own selection
    expect(g[1].options.map((o) => [o.value, o.count, o.selected])).toEqual([
      ["Payables", 1, false],
      ["Receivables", 2, true],
      ["Settings", 1, false],
    ]);
    // by count, then label; a value is counted once per item
    expect(g[2].options.map((o) => [o.value, o.count])).toEqual([
      ["Chase overdue", 1],
      ["Credit request", 1],
    ]);
    expect(chipCounts(data, rows, {})[2].options.map((o) => [o.value, o.count])).toEqual([
      ["Chase overdue", 2],
      ["Bill on hold", 1],
      ["Credit request", 1],
      ["Terms differ", 1],
    ]);
  });

  it("a selected value with no items left still shows (so it can be switched off)", () => {
    const g = chipCounts(data, rows, { area: ["Gone"] });
    expect(g[1].options.find((o) => o.value === "Gone")).toEqual({ value: "Gone", label: "Gone", count: 0, selected: true });
  });

  it("URL state: repeated f.<key> params, scoped names, other params kept, page reset", () => {
    expect(chipParam("priority")).toBe("f.priority");
    expect(chipParam("priority", "sent")).toBe("f.sent.priority");
    let q = toggleChipSearch("section=open&panel=task%3A1&page=2", "priority", "High");
    expect(q).toBe("section=open&panel=task%3A1&f.priority=High");
    q = toggleChipSearch(q, "priority", "Urgent");
    expect(readChips(new URLSearchParams(q), rows)).toEqual({ priority: ["High", "Urgent"] });
    q = toggleChipSearch(q, "priority", "High");
    expect(readChips(new URLSearchParams(q), rows)).toEqual({ priority: ["Urgent"] });
    expect(readChips({ "f.area": ["Payables", "Payables"], "f.topic": "Bill on hold" }, rows)).toEqual({ area: ["Payables"], topic: ["Bill on hold"] });
    expect(clearChipsSearch(q, ["priority", "area"])).toBe("section=open&panel=task%3A1");
    expect(readChips(new URLSearchParams(toggleChipSearch("", "area", "Payables", "hold")), rows, "hold")).toEqual({ area: ["Payables"] });
  });
});
