import { prisma } from "@/lib/db";

/** Values used until Settings → Company is saved (and by the seed script). */
export const DEFAULT_COMPANY = {
  id: "default",
  name: "Fulfilment Australia",
  shortName: "FA",
  accountHolderName: null as string | null,
  accountHolderEmail: null as string | null,
  primaryColour: "#1F54EE",
  accentColour: "#010028",
  textColour: "#14132E",
  timezone: "Australia/Sydney",
};

/** The FA brand (Settings → Branding → "Reset to FA brand"). Status colours are fixed and not part of this. */
export const FA_BRAND = {
  accentColour: DEFAULT_COMPANY.accentColour,
  primaryColour: DEFAULT_COMPANY.primaryColour,
  textColour: DEFAULT_COMPANY.textColour,
} as const;

/** Bundled default artwork (public/brand). */
export const DEFAULT_LOGOS = {
  /** Blue mark + Prussian word mark — light backgrounds (menu, print) */
  light: "/brand/fa-logo-blue-prussian.svg",
  /** Blue mark + white word mark — dark backgrounds (email header) */
  dark: "/brand/fa-logo-blue-white.svg",
  /** PNG of the dark-background logo — email clients do not render SVG */
  darkEmail: "/brand/fa-logo-blue-white.png",
  /** Square mark — collapsed menu rail */
  mark: "/brand/fa-mark.svg",
} as const;

export interface CompanyInfo {
  id: string;
  name: string;
  shortName: string;
  accountHolderName: string | null;
  accountHolderEmail: string | null;
  primaryColour: string;
  accentColour: string;
  textColour: string;
  timezone: string;
  hasLogoLight: boolean;
  hasLogoDark: boolean;
  hasLogoMark: boolean;
  /** Mime type of the uploaded dark-background logo (emails need a raster image) */
  logoDarkMime?: string | null;
  /** Changes whenever the company row is saved — appended to logo URLs to bust caches */
  logoVersion?: number;
  /** False when the database could not be reached (app still renders) */
  dbOk: boolean;
}

export async function getCompany(): Promise<CompanyInfo> {
  try {
    const row = await prisma.company.findUnique({
      where: { id: "default" },
      select: {
        id: true,
        name: true,
        shortName: true,
        accountHolderName: true,
        accountHolderEmail: true,
        primaryColour: true,
        accentColour: true,
        textColour: true,
        timezone: true,
        logoLightMime: true,
        logoDarkMime: true,
        logoMarkMime: true,
        updatedAt: true,
      },
    });
    if (!row) return { ...DEFAULT_COMPANY, hasLogoLight: false, hasLogoDark: false, hasLogoMark: false, dbOk: true };
    return {
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      accountHolderName: row.accountHolderName,
      accountHolderEmail: row.accountHolderEmail,
      primaryColour: row.primaryColour,
      accentColour: row.accentColour,
      textColour: row.textColour,
      timezone: row.timezone,
      hasLogoLight: !!row.logoLightMime,
      hasLogoDark: !!row.logoDarkMime,
      hasLogoMark: !!row.logoMarkMime,
      logoDarkMime: row.logoDarkMime,
      logoVersion: row.updatedAt.getTime(),
      dbOk: true,
    };
  } catch {
    return { ...DEFAULT_COMPANY, hasLogoLight: false, hasLogoDark: false, hasLogoMark: false, dbOk: false };
  }
}

export type LogoVariant = "light" | "dark" | "mark";

/**
 * URL for a company logo. Falls back to the bundled FA artwork when none is uploaded.
 * `{ email: true }` returns a raster default for the dark logo (email clients do not render SVG).
 */
export function logoUrl(
  company: Pick<CompanyInfo, "hasLogoLight" | "hasLogoDark"> & { hasLogoMark?: boolean; logoVersion?: number },
  variant: LogoVariant,
  opts: { email?: boolean } = {},
): string {
  const uploaded = variant === "light" ? company.hasLogoLight : variant === "dark" ? company.hasLogoDark : !!company.hasLogoMark;
  if (uploaded) return `/api/company/logo?variant=${variant}${company.logoVersion ? `&v=${company.logoVersion}` : ""}`;
  if (variant === "dark" && opts.email) return DEFAULT_LOGOS.darkEmail;
  return DEFAULT_LOGOS[variant];
}
