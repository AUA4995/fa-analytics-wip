import { describe, expect, it } from "vitest";
import { parseTheme, themeAttr, themeToStore } from ".";

describe("theme preference", () => {
  it("anything but light/dark follows the device", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
  });
  it("stores null for the device setting and writes data-theme only for light/dark", () => {
    expect(themeToStore("system")).toBeNull();
    expect(themeToStore("dark")).toBe("dark");
    expect(themeAttr(null)).toBeUndefined();
    expect(themeAttr("light")).toBe("light");
    expect(themeAttr("dark")).toBe("dark");
    expect(themeAttr("bogus")).toBeUndefined();
  });
});
