import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashKey } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — which key this is and what it may read (no scope needed). */
export async function GET(req: Request) {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(fa_live_[0-9A-Za-z]{32})$/);
  const row = m ? await prisma.apiKey.findUnique({ where: { hash: hashKey(m[1]) } }) : null;
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return NextResponse.json({ error: "Unknown, revoked or expired API key" }, { status: 401 });
  return NextResponse.json({ name: row.name, prefix: row.prefix, scopes: row.scopes, expiresAt: row.expiresAt });
}
