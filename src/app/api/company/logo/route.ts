import { prisma } from "@/lib/db";
import { DEFAULT_LOGOS } from "@/lib/company";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded company logo. ?variant=light (artwork for light backgrounds) | dark (for dark backgrounds) | mark (menu rail).
 * Falls back to the bundled FA artwork. Uploaded SVGs are served with a locked-down CSP so they can never run script.
 */
export async function GET(request: Request) {
  const v = new URL(request.url).searchParams.get("variant");
  const variant = v === "dark" ? "dark" : v === "mark" ? "mark" : "light";
  const row = await prisma.company.findUnique({
    where: { id: "default" },
    select: { logoLight: true, logoLightMime: true, logoDark: true, logoDarkMime: true, logoMark: true, logoMarkMime: true },
  });
  const bytes = variant === "dark" ? row?.logoDark : variant === "mark" ? row?.logoMark : row?.logoLight;
  const mime = variant === "dark" ? row?.logoDarkMime : variant === "mark" ? row?.logoMarkMime : row?.logoLightMime;
  if (!bytes || !mime) {
    return Response.redirect(new URL(DEFAULT_LOGOS[variant], request.url), 307);
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    },
  });
}
