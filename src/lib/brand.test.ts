import { describe, expect, it } from "vitest";
import { brandColours, brandCss } from "./brand";
import { logoUrl } from "./company";

describe("brand tokens", () => {
  it("writes the three brand tokens and falls back to the FA brand for bad values", () => {
    expect(brandCss({ accentColour: "#010028", primaryColour: "#1f54ee", textColour: "#14132E" })).toBe(":root{--brand-accent:#010028;--brand-blue:#1F54EE;--brand-ink:#14132E;}");
    expect(brandColours({ primaryColour: "red;}body{display:none" })).toEqual({ accentColour: "#010028", primaryColour: "#1F54EE", textColour: "#14132E" });
  });
  it("uses the bundled FA logos until one is uploaded; emails get a PNG", () => {
    const none = { hasLogoLight: false, hasLogoDark: false, hasLogoMark: false };
    expect(logoUrl(none, "light")).toBe("/brand/fa-logo-blue-prussian.svg");
    expect(logoUrl(none, "dark")).toBe("/brand/fa-logo-blue-white.svg");
    expect(logoUrl(none, "dark", { email: true })).toBe("/brand/fa-logo-blue-white.png");
    expect(logoUrl(none, "mark")).toBe("/brand/fa-mark.svg");
    expect(logoUrl({ ...none, hasLogoDark: true, logoVersion: 5 }, "dark", { email: true })).toBe("/api/company/logo?variant=dark&v=5");
  });
});
