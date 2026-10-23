import { getCurrentUser } from "@/lib/auth/session";
import { reportPdf } from "@/lib/reports/send";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Preview the PDF exactly as it would be sent (without the AI summary, which is written at send time). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;
  try {
    const { pdf, fileName } = await reportPdf(id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"`, "Cache-Control": "no-store" } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 400 });
  }
}
