import { describe, expect, it } from "vitest";
import { BOTTOM_MENU, MAIN_MENU, PAGES, crumbFor, pageForPath, parseSection, sectionHref, showSection } from "./sections";

describe("FA Analytics menu", () => {
  it("has the main menu in the brief's order, with Data sources, API connections and Settings at the bottom", () => {
    expect(MAIN_MENU.map((k) => PAGES[k].label)).toEqual(["Overview", "Operations", "Cost & margin", "Leakage", "Improvements & savings", "Rate review", "Reports", "KPI", "Finance", "Tasks"]);
    expect(BOTTOM_MENU.map((k) => PAGES[k].label)).toEqual(["Data sources", "API connections", "Settings"]);
  });
  it("Improvements lists Ideas before Initiatives; Rate review has Calendar · In progress · Workbench", () => {
    expect(PAGES.improve.sections.map((s) => s[1])).toEqual(["Overview", "Ideas", "Initiatives"]);
    expect(PAGES.rates.sections.map((s) => s[1])).toEqual(["Calendar", "In progress", "Workbench"]);
  });
  it("Operations has Order lookup first (batch 1), then the sections built next", () => {
    expect(PAGES.operations.sections.map((s) => s[1])).toEqual(["Order lookup", "Receiving", "SLA", "Returns", "Trends & forecast"]);
    expect(pageForPath("/operations")).toBe("operations");
  });
  it("maps paths to pages", () => {
    expect(pageForPath("/")).toBe("overview");
    expect(pageForPath("/cost")).toBe("cost");
    expect(pageForPath("/settings/anything")).toBe("settings");
    expect(pageForPath("/login")).toBeNull();
  });
  it("parses sections and falls back to the first", () => {
    expect(parseSection("leakage", "log")).toBe("log");
    expect(parseSection("leakage", "nope")).toBe("overview");
    expect(parseSection("overview", "x")).toBe("");
    expect(sectionHref("cost", "base")).toBe("/cost");
    expect(sectionHref("cost", "serve")).toBe("/cost?section=serve");
    expect(crumbFor("leakage", "ratechecks")).toEqual(["Leakage", "Rate checks"]);
    expect(crumbFor("leakage", "overview")).toEqual(["Leakage"]);
    expect(showSection("overview", "x")).toBe(true);
  });
});
