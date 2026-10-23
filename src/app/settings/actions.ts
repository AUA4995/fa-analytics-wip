"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEFAULT_COMPANY } from "@/lib/company";
import { assertAdmin } from "@/lib/auth/session";

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const CompanyForm = z.object({
  name: z.string().trim().min(1, "Company name is required").max(120),
  shortName: z.string().trim().min(1, "Short name is required").max(20),
  accountHolderName: z.string().trim().max(120).optional().or(z.literal("")),
  accountHolderEmail: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  // Colour and logos now live in Settings → Branding; still accepted here when sent (older form / API callers).
  primaryColour: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #1F54EE")
    .transform((s) => s.toUpperCase())
    .optional(),
  timezone: z.string().trim().min(1).max(64),
});

export type CompanyActionState = { ok: boolean; message: string; errors?: Record<string, string> };

export async function saveCompany(_prev: CompanyActionState, formData: FormData): Promise<CompanyActionState> {
  try {
    await assertAdmin();
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  const parsed = CompanyForm.safeParse({
    name: formData.get("name"),
    shortName: formData.get("shortName"),
    accountHolderName: formData.get("accountHolderName") ?? "",
    accountHolderEmail: formData.get("accountHolderEmail") ?? "",
    primaryColour: formData.get("primaryColour") ?? undefined,
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
    return { ok: false, message: "Please fix the highlighted fields.", errors };
  }

  // Validate the timezone against the runtime's IANA list.
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, message: "Unknown timezone.", errors: { timezone: "Use an IANA name such as Australia/Sydney" } };
  }

  const logos: {
    logoLight?: Uint8Array<ArrayBuffer>;
    logoLightMime?: string;
    logoDark?: Uint8Array<ArrayBuffer>;
    logoDarkMime?: string;
  } = {};
  for (const variant of ["Light", "Dark"] as const) {
    const file = formData.get(`logo${variant}`);
    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_LOGO_TYPES.has(file.type)) {
        return { ok: false, message: `Logo (${variant.toLowerCase()}) must be PNG, JPEG, SVG or WebP.` };
      }
      if (file.size > MAX_LOGO_BYTES) {
        return { ok: false, message: `Logo (${variant.toLowerCase()}) must be under 2 MB.` };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (variant === "Light") {
        logos.logoLight = bytes;
        logos.logoLightMime = file.type;
      } else {
        logos.logoDark = bytes;
        logos.logoDarkMime = file.type;
      }
    }
  }
  const clearLight = formData.get("clearLogoLight") === "on";
  const clearDark = formData.get("clearLogoDark") === "on";

  const data = {
    name: parsed.data.name,
    shortName: parsed.data.shortName,
    accountHolderName: parsed.data.accountHolderName || null,
    accountHolderEmail: parsed.data.accountHolderEmail || null,
    ...(parsed.data.primaryColour ? { primaryColour: parsed.data.primaryColour } : {}),
    timezone: parsed.data.timezone,
    ...logos,
    ...(clearLight ? { logoLight: null, logoLightMime: null } : {}),
    ...(clearDark ? { logoDark: null, logoDarkMime: null } : {}),
  };

  try {
    await prisma.company.upsert({
      where: { id: DEFAULT_COMPANY.id },
      create: { id: DEFAULT_COMPANY.id, ...data },
      update: data,
    });
  } catch (err) {
    return { ok: false, message: `Could not save: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Company settings saved." };
}
