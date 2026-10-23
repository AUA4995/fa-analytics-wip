import { describe, expect, it } from "vitest";
import { encodeQr, qrSvg } from "./qr";

/** Decoding was checked against OpenCV's QR reader during the build (versions 1–17); these guard the structure. */
describe("QR encoder", () => {
  const finderAt = (m: boolean[][], x0: number, y0: number) => {
    for (let dy = 0; dy < 7; dy++)
      for (let dx = 0; dx < 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        if (m[y0 + dy][x0 + dx] !== (ring !== 2)) return false;
      }
    return true;
  };

  it("picks the smallest version for level M byte mode", () => {
    expect(encodeQr("hello").version).toBe(1);
    expect(encodeQr("x".repeat(40)).version).toBe(3);
    const uri = "otpauth://totp/FA%20Analytics:asal%40fulfilmentaustralia.com.au?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=FA%20Analytics&algorithm=SHA1&digits=6&period=30";
    const q = encodeQr(uri);
    expect(q.version).toBe(9);
    expect(q.size).toBe(9 * 4 + 17);
  });

  it("draws the three finder patterns, timing patterns and the dark module", () => {
    const q = encodeQr("otpauth://totp/test?secret=ABC");
    const n = q.size;
    expect(finderAt(q.modules, 0, 0)).toBe(true);
    expect(finderAt(q.modules, n - 7, 0)).toBe(true);
    expect(finderAt(q.modules, 0, n - 7)).toBe(true);
    for (let i = 8; i < n - 8; i++) {
      expect(q.modules[6][i]).toBe(i % 2 === 0);
      expect(q.modules[i][6]).toBe(i % 2 === 0);
    }
    expect(q.modules[n - 8][8]).toBe(true);
  });

  it("is deterministic and renders an SVG", () => {
    expect(encodeQr("same").modules).toEqual(encodeQr("same").modules);
    const svg = qrSvg("hello");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 29 29"');
  });

  it("refuses text that can't fit", () => {
    expect(() => encodeQr("x".repeat(3000))).toThrow(/too long/);
  });
});
