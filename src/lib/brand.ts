import { FA_BRAND } from "@/lib/company";

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** A safe #RRGGBB (upper case) or the fallback. */
export function safeHex(value: string | null | undefined, fallback: string): string {
  return value && HEX_RE.test(value) ? value.toUpperCase() : fallback;
}

export interface BrandColours {
  accentColour: string;
  primaryColour: string;
  textColour: string;
}

/** Resolved brand colours for a company row (invalid values fall back to the FA brand). */
export function brandColours(c: Partial<BrandColours>): BrandColours {
  return {
    accentColour: safeHex(c.accentColour, FA_BRAND.accentColour),
    primaryColour: safeHex(c.primaryColour, FA_BRAND.primaryColour),
    textColour: safeHex(c.textColour, FA_BRAND.textColour),
  };
}

/**
 * CSS for the root layout: the three raw brand colours. globals.css turns them into the light and dark looks
 * (--header, --blue, --ink and their tints), so a brand change works in both.
 */
export function brandCss(c: Partial<BrandColours>): string {
  const b = brandColours(c);
  return `:root{--brand-accent:${b.accentColour};--brand-blue:${b.primaryColour};--brand-ink:${b.textColour};}`;
}
