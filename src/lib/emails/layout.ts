import { getCompany, logoUrl } from "@/lib/company";

/**
 * Shared email chrome (sign-in emails now, report emails later) — table-based HTML with inline styles so it renders
 * in Outlook/Gmail. Brand colours come from the Company record.
 */

export interface EmailBrand {
  companyName: string;
  shortName: string;
  primaryColour: string;
  /** Dark accent for the email header (Settings → Branding); FA navy when not set */
  accentColour?: string;
  /** Body text colour (Settings → Branding) */
  textColour?: string;
  /** Absolute URL of the dark-background logo (light artwork) */
  logoUrl: string;
  appUrl: string;
}

export const COLOURS = {
  charcoal: "#14132E",
  greyDark: "#3A3950",
  grey: "#74738A",
  /** FA brand defaults — the Company record overrides them (EmailBrand) */
  navy: "#010028",
  blue: "#1F54EE",
  border: "#E3E8EF",
  surface: "#F5F7FA",
  red: "#B42318",
  redBg: "#FEF3F2",
  amber: "#B54708",
  amberBg: "#FFFAEB",
  green: "#067647",
  greenBg: "#ECFDF3",
};

export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function money(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function badge(text: string, kind: "red" | "amber" | "green" | "grey" = "grey"): string {
  const map = {
    red: [COLOURS.red, COLOURS.redBg],
    amber: [COLOURS.amber, COLOURS.amberBg],
    green: [COLOURS.green, COLOURS.greenBg],
    grey: [COLOURS.greyDark, COLOURS.surface],
  } as const;
  const [fg, bg] = map[kind];
  return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;color:${fg};background:${bg};white-space:nowrap;">${esc(text)}</span>`;
}

export function section(title: string, body: string, opts: { tone?: "red" | "amber" | "normal"; note?: string } = {}): string {
  const tone = opts.tone ?? "normal";
  const bar = tone === "red" ? COLOURS.red : tone === "amber" ? COLOURS.amber : COLOURS.grey;
  return `
<tr><td style="padding:18px 0 6px 0;">
  <div style="border-left:4px solid ${bar};padding-left:10px;">
    <div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${COLOURS.grey};">${esc(title)}</div>
    ${opts.note ? `<div style="font-size:12px;color:${COLOURS.grey};margin-top:2px;">${esc(opts.note)}</div>` : ""}
  </div>
</td></tr>
<tr><td style="padding:0;">${body}</td></tr>`;
}

export function table(headers: Array<{ label: string; align?: "left" | "right" }>, rows: string[][]): string {
  if (!rows.length) return `<div style="padding:10px 12px;color:${COLOURS.grey};font-size:13px;">Nothing here today.</div>`;
  const th = headers
    .map(
      (h) =>
        `<th align="${h.align ?? "left"}" style="padding:6px 8px;border-bottom:1px solid ${COLOURS.border};font-size:11px;font-weight:600;color:${COLOURS.grey};text-transform:uppercase;letter-spacing:.04em;">${esc(h.label)}</th>`,
    )
    .join("");
  const trs = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map(
            (c, i) =>
              `<td align="${headers[i]?.align ?? "left"}" valign="top" style="padding:7px 8px;border-bottom:1px solid ${COLOURS.border};font-size:13px;color:${COLOURS.charcoal};">${c}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

export function kpis(items: Array<{ label: string; value: string; tone?: "red" | "amber" | "normal" }>): string {
  const cells = items
    .map((k) => {
      const colour = k.tone === "red" ? COLOURS.red : k.tone === "amber" ? COLOURS.amber : COLOURS.charcoal;
      return `<td style="padding:10px 12px;background:${COLOURS.surface};border-radius:6px;">
        <div style="font-size:11px;color:${COLOURS.grey};text-transform:uppercase;letter-spacing:.04em;">${esc(k.label)}</div>
        <div style="font-size:18px;font-weight:600;color:${colour};margin-top:2px;">${esc(k.value)}</div>
      </td><td style="width:8px;"></td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>${cells}</tr></table>`;
}

export function link(href: string, text: string, colour: string = COLOURS.blue): string {
  return `<a href="${esc(href)}" style="color:${esc(colour)};text-decoration:none;">${esc(text)}</a>`;
}

/** Reference numbers (tickets, invoices, bills, credit notes): same link with a dotted underline, no arrow. */
export function refLink(href: string, text: string, colour: string = COLOURS.blue): string {
  return `<a href="${esc(href)}" style="color:${esc(colour)};text-decoration:none;border-bottom:1px dotted ${esc(colour)};">${esc(text)}</a>`;
}

/** Digest footer tail (default). Sign-in emails pass their own neutral line instead. */
export const FOOTER_TAIL = "Outside systems are read-only for this app.";

export function layout(
  brand: EmailBrand,
  opts: { title: string; dateLabel: string; preheader: string; bodyRows: string; footerNote: string; footerTail?: string },
): string {
  const hex = (v: string | undefined, fallback: string) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
  const header = hex(brand.accentColour, COLOURS.navy);
  const ink = hex(brand.textColour, COLOURS.charcoal);
  const primary = hex(brand.primaryColour, COLOURS.blue);
  return `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${COLOURS.surface};color:${ink};font-family:Calibri,Segoe UI,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.surface};"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:${header};padding:14px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${esc(brand.logoUrl)}" alt="${esc(brand.companyName)}" height="32" style="height:32px;width:auto;display:block;border:0;"></td>
      <td align="right" style="color:#ffffff;font-size:13px;opacity:.85;">Analytics</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:18px 20px 4px 20px;">
    <div style="font-size:20px;font-weight:600;color:${ink};">${esc(opts.title)}</div>
    <div style="font-size:13px;color:${COLOURS.grey};margin-top:2px;">${esc(opts.dateLabel)}</div>
  </td></tr>
  <tr><td style="padding:8px 20px 20px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.bodyRows}</table>
  </td></tr>
  <tr><td style="padding:12px 20px;border-top:1px solid ${COLOURS.border};font-size:11px;color:${COLOURS.grey};">
    ${esc(opts.footerNote)} · ${link(brand.appUrl, "Open FA Analytics", primary)}${opts.footerTail === "" ? "" : ` · ${esc(opts.footerTail ?? FOOTER_TAIL)}`}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function brandFromCompany(appUrlOverride?: string): Promise<EmailBrand> {
  const company = await getCompany();
  const appUrl = (appUrlOverride || process.env.APP_URL || "http://localhost:3002").replace(/\/$/, "");
  return {
    companyName: company.name,
    shortName: company.shortName,
    primaryColour: company.primaryColour,
    accentColour: company.accentColour,
    textColour: company.textColour,
    logoUrl: `${appUrl}${logoUrl(company, "dark", { email: true })}`,
    appUrl,
  };
}
