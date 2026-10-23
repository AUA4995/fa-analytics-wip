import { createHmac, randomBytes } from "node:crypto";

/**
 * TOTP (RFC 6238) on top of HOTP (RFC 4226): HMAC-SHA-1, 30-second steps, 6 digits — what Microsoft and
 * Google Authenticator expect. No dependency; node:crypto only.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too (clock drift of up to ±30 s). */
export const TOTP_WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 (32 characters). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226 HOTP value for a counter. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totp(secret: Buffer, timeMs: number, digits = TOTP_DIGITS): string {
  return hotp(secret, stepAt(timeMs), digits);
}

/** Digits only ("123 456" → "123456"); null when it can't be a code. */
export function normaliseCode(input: string): string | null {
  const d = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(d) ? d : null;
}

/**
 * Checks a 6-digit code against steps t-1, t, t+1. Returns the matching step, or null.
 * `afterStep`: steps at or before it are refused (stops the same code being used twice).
 */
export function verifyTotp(secretB32: string, code: string, timeMs: number, afterStep: number | null = null): number | null {
  const c = normaliseCode(code);
  if (!c) return null;
  const secret = base32Decode(secretB32);
  const now = stepAt(timeMs);
  let match: number | null = null;
  for (let s = now - TOTP_WINDOW; s <= now + TOTP_WINDOW; s++) {
    // Constant work: check every step, don't stop early.
    if (hotp(secret, s) === c && (afterStep === null || s > afterStep) && match === null) match = s;
  }
  return match;
}

/** otpauth:// URI for the QR code (issuer and account appear in the authenticator app). */
export function otpauthUri(opts: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const q = new URLSearchParams({ secret: opts.secret, issuer: opts.issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${q.toString().replace(/\+/g, "%20")}`;
}

/** "ABCD EFGH …" — easier to type into an authenticator app by hand. */
export function groupKey(secretB32: string): string {
  return secretB32.replace(/(.{4})/g, "$1 ").trim();
}

// ---------- Backup codes ----------

const BACKUP_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/1/i/l/o
export const BACKUP_CODE_COUNT = 10;

/** 10 random codes like "k7m2-9xqd". */
export function newBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    const b = randomBytes(10);
    let s = "";
    for (let i = 0; i < 10; i++) s += BACKUP_ALPHABET[b[i] % BACKUP_ALPHABET.length];
    out.add(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return [...out];
}

/** Lower-case, no spaces or dashes; null when it can't be a backup code. */
export function normaliseBackupCode(input: string): string | null {
  const s = input.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z0-9]{10}$/.test(s) ? s : null;
}
