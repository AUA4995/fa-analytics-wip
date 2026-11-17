import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorise, isResponse } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — which key this is and what it may read (no scope needed; same limits as every route). */
export async function GET(req: Request) {
  const who = await authorise(req, null);
  if (isResponse(who)) return who;
  const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: who.id } });
  return NextResponse.json({ name: row.name, prefix: row.prefix, scopes: row.scopes, expiresAt: row.expiresAt });
}
