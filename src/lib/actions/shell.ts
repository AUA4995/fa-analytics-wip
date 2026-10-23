"use server";

import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { parseTheme, themeToStore, type ThemePref } from "@/lib/theme";

/** Remember the left-menu choice for the signed-in user (pinned open, or collapsed to the icon rail). */
export async function setMenuPinned(pinned: boolean): Promise<{ ok: boolean }> {
  try {
    const me = await assertUser();
    await prisma.user.update({ where: { id: me.id }, data: { menuPinned: !!pinned } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Remember the signed-in person's look: follow the device, light or dark. Only their own account changes. */
export async function setTheme(pref: ThemePref): Promise<{ ok: boolean; theme: ThemePref }> {
  const theme = parseTheme(pref);
  try {
    const me = await assertUser();
    await prisma.user.update({ where: { id: me.id }, data: { theme: themeToStore(theme) } });
    return { ok: true, theme };
  } catch {
    return { ok: false, theme };
  }
}
