import PDFDocument from "pdfkit";
import type { BuiltReport, Cell } from "./build";

/**
 * Branded PDF from the report blocks (pdfkit, no browser needed on the server). Landscape A4 so wide tables fit.
 * Same content as the screen; nothing is added except the header, footer and page numbers.
 */
export interface PdfBrand {
  companyName: string;
  accent: string;
  blue: string;
  logo?: Buffer | null;
}

const MUTED = "#787878";
const INK = "#282828";
const LINE = "#E4E4E4";

export function pdfSafe(t: string): string {
  return t.replace(/▲ ?/g, "+").replace(/▼ ?/g, "-").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/→/g, "->").replace(/−/g, "-").replace(/±/g, "+/-").replace(/[^\x00-\xFF€–—‘’“”•…]/g, "");
}

const val = (c: Cell) => (typeof c === "string" ? c : c.v);
const sub = (c: Cell) => (typeof c === "string" ? undefined : c.s);

export async function renderPdf(rep: BuiltReport, brand: PdfBrand, meta: { cls: string; generated: string; aiSummary?: string | null }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 70, bottom: 50, left: 40, right: 40 }, bufferPages: true, info: { Title: rep.title, Author: brand.companyName } });
  // The built-in PDF fonts only cover WinAnsi: swap the few symbols the reports use for plain-text equivalents.
  const orig = doc.text.bind(doc) as (...a: unknown[]) => PDFKit.PDFDocument;
  (doc as unknown as { text: (...a: unknown[]) => PDFKit.PDFDocument }).text = (t: unknown, ...a: unknown[]) => orig(typeof t === "string" ? pdfSafe(t) : t, ...a);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const W = doc.page.width - 80;
  const header = () => {
    doc.save().rect(0, 0, doc.page.width, 46).fill(brand.accent === "#010028" ? "#000000" : brand.accent).restore();
    if (brand.logo) {
      try {
        doc.image(brand.logo, 40, 11, { height: 24 });
      } catch {
        doc.fillColor("#fff").font("Helvetica-Bold").fontSize(13).text(brand.companyName, 40, 16);
      }
    } else doc.fillColor("#fff").font("Helvetica-Bold").fontSize(13).text(brand.companyName, 40, 16);
    doc.fillColor("#fff").font("Helvetica").fontSize(9).text(`Analytics · ${meta.cls === "INTERNAL" ? "Internal" : meta.cls === "CLIENT_SAFE" ? "Client report" : "External finance"}`, 40, 19, { width: W, align: "right" });
    doc.fillColor(INK);
    doc.y = 64;
  };
  doc.on("pageAdded", header);
  header();
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(rep.title, 40, doc.y);
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(rep.subtitle);
  doc.moveDown(0.6);
  if (meta.aiSummary) {
    const y0 = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(meta.aiSummary, 52, y0 + 8, { width: W - 24 });
    const h = doc.y - y0 + 8;
    doc.save().roundedRect(40, y0, W, h, 6).lineWidth(0.8).stroke("#A0C8FF").restore();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#0078F0").text("SUMMARY · WRITTEN BY AI FROM THE FIGURES BELOW", 52, y0 - 9);
    doc.y = y0 + h + 10;
  }
  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - 60) doc.addPage();
  };
  for (const b of rep.blocks) {
    if (b.kind === "kpis") {
      ensure(64);
      const n = b.items.length;
      const gap = 10;
      const bw = (W - gap * (n - 1)) / n;
      const y = doc.y;
      b.items.forEach((k, i) => {
        const x = 40 + i * (bw + gap);
        doc.save().roundedRect(x, y, bw, 56, 6).lineWidth(0.8).stroke(LINE).restore();
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(k.label, x + 10, y + 8, { width: bw - 20 });
        doc.font("Helvetica-Bold").fontSize(16).fillColor(k.tone === "red" ? "#B42318" : k.tone === "green" ? "#1E7A3C" : INK).text(k.value, x + 10, y + 21, { width: bw - 20 });
        if (k.sub) doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(k.sub, x + 10, y + 42, { width: bw - 20, height: 12, ellipsis: true });
      });
      doc.y = y + 68;
    } else if (b.kind === "note") {
      ensure(30);
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(b.tone === "warn" ? "#9A6200" : MUTED).text(b.text, 40, doc.y, { width: W });
      doc.moveDown(0.8);
    } else if (b.kind === "bars") {
      ensure(40);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(b.title.toUpperCase(), 40, doc.y, { characterSpacing: 0.5 });
      if (b.sub) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(b.sub);
      doc.moveDown(0.3);
      const mx = Math.max(1, ...b.rows.map((r) => r.value));
      for (const r of b.rows) {
        ensure(14);
        const y = doc.y;
        doc.font("Helvetica").fontSize(8).fillColor(INK).text(r.label, 40, y, { width: 70 });
        const w = ((W - 200) * r.value) / mx;
        doc.save().rect(115, y + 1, Math.max(1, w), 8).fill(r.forecast ? "#A0C8FF" : brand.blue).restore();
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(r.display, 120 + w, y, { width: 120 });
        doc.y = y + 12;
      }
      doc.moveDown(0.8);
    } else if (b.kind === "table") {
      ensure(50);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(b.title.toUpperCase(), 40, doc.y, { characterSpacing: 0.5 });
      if (b.sub) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(b.sub);
      doc.moveDown(0.3);
      const cols = b.head.length;
      const first = Math.min(170, W * 0.28);
      const cw = cols > 1 ? (W - first) / (cols - 1) : W;
      const right = new Set(b.right ?? []);
      const xOf = (i: number) => (i === 0 ? 40 : 40 + first + (i - 1) * cw);
      const wOf = (i: number) => (i === 0 ? first : cw) - 6;
      const head = () => {
        const y = doc.y;
        b.head.forEach((h, i) => doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text(h.toUpperCase(), xOf(i), y, { width: wOf(i), align: right.has(i) ? "right" : "left" }));
        doc.y = y + 13;
        doc.save().moveTo(40, doc.y - 2).lineTo(40 + W, doc.y - 2).lineWidth(0.6).stroke(LINE).restore();
      };
      head();
      const row = (cells: Cell[], bold = false) => {
        const hasSub = cells.some((c) => sub(c));
        const h = hasSub ? 22 : 14;
        if (doc.y + h > doc.page.height - 60) {
          doc.addPage();
          head();
        }
        const y = doc.y;
        cells.forEach((c, i) => {
          const tone = typeof c === "string" ? undefined : c.tone;
          doc.font(bold || (hasSub && i > 0) ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(tone === "pos" ? "#1E7A3C" : tone === "neg" ? "#B42318" : INK).text(val(c), xOf(i), y, { width: wOf(i), align: right.has(i) ? "right" : "left", height: 11, ellipsis: true });
          const s = sub(c);
          if (s) doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(s, xOf(i), y + 11, { width: wOf(i), align: right.has(i) ? "right" : "left" });
        });
        doc.y = y + h;
        doc.save().moveTo(40, doc.y - 2).lineTo(40 + W, doc.y - 2).lineWidth(0.3).stroke(LINE).restore();
      };
      if (!b.rows.length) doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text("Nothing for this period.", 40, doc.y);
      for (const r of b.rows) row(r);
      if (b.total) row(b.total, true);
      doc.moveDown(1);
    }
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Writing inside the bottom margin would make PDFKit start a new page — lift the margin for the footer line.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`${brand.companyName} · ${meta.generated} · page ${i + 1} of ${range.count}`, 40, doc.page.height - 32, { width: W, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
