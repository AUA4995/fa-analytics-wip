"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { generateKey, validScopes } from "@/lib/apikeys";
import { logChange } from "@/lib/model/store";

export type KeyState = { ok: boolean; message: string; key?: string };

/** Create a key: the full key is returned once and never stored. */
export async function createKeyAction(_p: KeyState | null, fd: FormData): Promise<KeyState> {
  try {
    const me = await assertAdmin();
    const name = String(fd.get("name") ?? "").trim();
    const scopes = fd.getAll("scopes").map(String);
    const days = Number(fd.get("days") ?? 365);
    if (name.length < 2) return { ok: false, message: "Name the app this key is for" };
    if (!validScopes(scopes)) return { ok: false, message: "Pick at least one scope" };
    if (await prisma.apiKey.findFirst({ where: { name, revokedAt: null } })) return { ok: false, message: "An active key with this name already exists — revoke it first or use another name" };
    const k = generateKey();
    const row = await prisma.apiKey.create({ data: { name, prefix: k.prefix, hash: k.hash, scopes, createdBy: me.name, expiresAt: days > 0 ? new Date(Date.now() + days * 86400000) : null } });
    await logChange({ entity: "apikey", entityId: row.id, field: "_created", oldValue: null, newValue: { name, scopes, expiresAt: row.expiresAt }, actor: { type: "USER", name: me.name } });
    revalidatePath("/apis");
    return { ok: true, message: "Key created — copy it now; it won't be shown again.", key: k.key };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function revokeKeyAction(id: string): Promise<KeyState> {
  try {
    const me = await assertAdmin();
    const row = await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date(), revokedBy: me.name } });
    await logChange({ entity: "apikey", entityId: id, field: "revoked", oldValue: null, newValue: row.name, actor: { type: "USER", name: me.name } });
    revalidatePath("/apis");
    return { ok: true, message: "Revoked" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
