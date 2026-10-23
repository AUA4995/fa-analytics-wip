"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { DEFAULT_COMPANY, FA_BRAND } from "@/lib/company";
import { assertAdmin } from "@/lib/auth/session";
import { HEX_RE } from "@/lib/brand";

/** Settings → Branding (brief §12.11b). Colours + logos on the Company row; status colours stay fixed. */

export type BrandingActionState = { ok: boolean; message: string; errors?: Record<string, string> };

const BRAND_LOGO_TYPES = ["image/svg+xml", "image/png", "image/jpeg"] as const;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_FIELDS = [
  ["logoDark", "Logo for dark backgrounds"],
  ["logoLight", "Logo for light backgrounds"],
  ["logoMark", "Menu icon"],
] as const;
const COLOUR_FIELDS = [
  ["accentColour", "Dark accents"],
  ["primaryColour", "Primary"],
  ["textColour", "Text"],
] as const;

async function ensureCompanyRow() {
  await prisma.company.upsert({
    where: { id: DEFAULT_COMPANY.id },
    update: {},
    create: { id: DEFAULT_COMPANY.id, name: DEFAULT_COMPANY.name, shortName: DEFAULT_COMPANY.shortName, timezone: DEFAULT_COMPANY.timezone },
  });
}

export async function saveBranding(_prev: BrandingActionState, formData: FormData): Promise<BrandingActionState> {
  try {
    await assertAdmin();
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  for (const [field, label] of COLOUR_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    if (!HEX_RE.test(v)) errors[field] = `${label} must be a hex colour like #1F54EE`;
    else data[field] = v.toUpperCase();
  }
  for (const [field, label] of LOGO_FIELDS) {
    const file = formData.get(field);
    if (file instanceof File && file.size > 0) {
      if (!(BRAND_LOGO_TYPES as readonly string[]).includes(file.type)) errors[field] = `${label} must be SVG, PNG or JPG.`;
      else if (file.size > MAX_LOGO_BYTES) errors[field] = `${label} must be under 2 MB.`;
      else {
        data[field] = new Uint8Array(await file.arrayBuffer());
        data[`${field}Mime`] = file.type;
      }
    }
    if (formData.get(`clear_${field}`) === "on") {
      data[field] = null;
      data[`${field}Mime`] = null;
    }
  }
  if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0], errors };

  try {
    await ensureCompanyRow();
    await prisma.company.update({ where: { id: DEFAULT_COMPANY.id }, data });
  } catch (err) {
    return { ok: false, message: `Could not save: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Branding saved — the app and the digest emails use it from now on." };
}

/** "Reset to FA brand": FA colours and the bundled FA logos (uploaded logos are removed). */
export async function resetBranding(): Promise<BrandingActionState> {
  try {
    await assertAdmin();
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  await ensureCompanyRow();
  await prisma.company.update({
    where: { id: DEFAULT_COMPANY.id },
    data: {
      ...FA_BRAND,
      logoDark: null,
      logoDarkMime: null,
      logoLight: null,
      logoLightMime: null,
      logoMark: null,
      logoMarkMime: null,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Back to the FA brand colours and logos." };
}
