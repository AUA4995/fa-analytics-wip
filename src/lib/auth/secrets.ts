import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Keys for sign-in secrets (2FA secrets at rest, backup-code hashes, the "this device" cookie).
 *
 *   AUTH_SECRET            preferred — any random string of 32+ characters (or 32 bytes base64)
 *   TOKEN_ENCRYPTION_KEY   fallback — the key that already encrypts the Xero tokens
 *
 * Each key is never used directly: HKDF derives a separate sub-key per purpose. Stored values carry the
 * key id ("a" = AUTH_SECRET, "t" = TOKEN_ENCRYPTION_KEY) so adding AUTH_SECRET later doesn't lock anyone out:
 * old values keep working with the key they were made with while it is still set.
 */

type KeyId = "a" | "t";
type Purpose = "totp-secret" | "backup-code" | "device-cookie";

export class AuthConfigError extends Error {}

function rawKey(id: KeyId): Buffer | null {
  if (id === "a") {
    const v = (process.env.AUTH_SECRET ?? "").trim();
    if (!v) return null;
    const b64 = /^[A-Za-z0-9+/]{43}=$/.test(v) ? Buffer.from(v, "base64") : null;
    if (b64 && b64.length === 32) return b64;
    if (v.length < 32) throw new AuthConfigError("AUTH_SECRET must be at least 32 characters (see .env.example).");
    return Buffer.from(v, "utf8");
  }
  const v = (process.env.TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (!v) return null;
  const buf = Buffer.from(v, "base64");
  return buf.length === 32 ? buf : null;
}

function currentKeyId(): KeyId {
  if (rawKey("a")) return "a";
  if (rawKey("t")) return "t";
  throw new AuthConfigError("Sign-in isn't set up on this server: add AUTH_SECRET to .env (see .env.example) and restart the app.");
}

export function isAuthKeyConfigured(): boolean {
  try {
    currentKeyId();
    return true;
  } catch {
    return false;
  }
}

function subKey(id: KeyId, purpose: Purpose): Buffer {
  const raw = rawKey(id);
  if (!raw) throw new AuthConfigError(id === "a" ? "AUTH_SECRET is no longer set — it was used to protect this value." : "TOKEN_ENCRYPTION_KEY is no longer set — it was used to protect this value.");
  return Buffer.from(hkdfSync("sha256", raw, Buffer.from("fa-accounts-hub"), Buffer.from(`auth:${purpose}`), 32));
}

/** AES-256-GCM. Format: "<keyId>:" + base64(iv).base64(ct).base64(tag) */
export function sealSecret(plain: string): string {
  const id = currentKeyId();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subKey(id, "totp-secret"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${id}:${iv.toString("base64")}.${ct.toString("base64")}.${cipher.getAuthTag().toString("base64")}`;
}

export function openSecret(stored: string): string {
  const m = /^([at]):([^.]+)\.([^.]*)\.([^.]+)$/.exec(stored);
  if (!m) throw new Error("Malformed stored secret");
  const [, id, iv, ct, tag] = m;
  const decipher = createDecipheriv("aes-256-gcm", subKey(id as KeyId, "totp-secret"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** Keyed hash for backup codes. Format "<keyId>:<hex>". */
export function hashBackupCode(userId: string, normalisedCode: string, id: KeyId = currentKeyId()): string {
  return `${id}:${createHmac("sha256", subKey(id, "backup-code")).update(`${userId}:${normalisedCode}`).digest("hex")}`;
}

/** Hashes of `code` under every key a stored hash may have been made with. */
export function backupCodeCandidates(userId: string, normalisedCode: string): string[] {
  const out: string[] = [];
  for (const id of ["a", "t"] as const) {
    try {
      if (rawKey(id)) out.push(hashBackupCode(userId, normalisedCode, id));
    } catch {
      /* key not usable */
    }
  }
  return out;
}

/** HMAC-signed value: base64url(payload) + "." + base64url(mac). */
export function signValue(payload: string): string {
  const id = currentKeyId();
  const body = Buffer.from(`${id}|${payload}`, "utf8").toString("base64url");
  const mac = createHmac("sha256", subKey(id, "device-cookie")).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySignedValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const sep = decoded.indexOf("|");
  const id = decoded.slice(0, sep);
  if (id !== "a" && id !== "t") return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", subKey(id, "device-cookie")).update(body).digest();
  } catch {
    return null;
  }
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return decoded.slice(sep + 1);
}
