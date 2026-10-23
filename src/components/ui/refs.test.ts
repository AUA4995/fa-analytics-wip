import { describe, expect, it } from "vitest";
import { FRONT_OPEN_URL, FRONT_SEARCH_URL, linkifyRefs, linkifyRefsHtml, resolveRef, type RefMatch } from "./refs";

const refs = (parts: Array<string | RefMatch>) => parts.filter((p): p is RefMatch => typeof p !== "string");

describe("linkifyRefs", () => {
  const ctx = {
    tickets: { "AC-6031": "cnv_abc" },
    invoices: { "INV-7130": "inv-guid" },
    creditNotes: { "CN-0412": "cn-guid" },
    bills: { "00201": "bill-guid", "RS-59724": "bill-2" },
    notInXero: { "BL-8840": "cnv_mail" },
  };

  it("links tickets, invoices, credit notes and known bill numbers; keeps the rest as text", () => {
    const parts = linkifyRefs("Re: AC-6031 · invoice INV-7130, credit CN-0412, bill 00201 and RS-59724.", ctx);
    expect(parts.map((p) => (typeof p === "string" ? p : `[${p.text}]`)).join("")).toBe(
      "Re: [AC-6031] · invoice [INV-7130], credit [CN-0412], bill [00201] and [RS-59724].",
    );
    const r = refs(parts);
    expect(r.map((x) => x.kind)).toEqual(["front", "xero-invoice", "xero-credit-note", "xero-bill", "xero-bill"]);
    expect(r[0].url).toBe(FRONT_OPEN_URL + "cnv_abc");
    expect(r[1].url).toContain("InvoiceID=inv-guid");
    expect(r[2].url).toContain("creditNoteID=cn-guid");
    expect(r[3].url).toBe("https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=bill-guid");
  });

  it("links every ticket prefix (AC, SU, SA, DTSAC) even without a known conversation", () => {
    const r = refs(linkifyRefs("SU-3320 SA-4061 DTSAC-120 AC-123", {}));
    expect(r.map((x) => x.text)).toEqual(["SU-3320", "SA-4061", "DTSAC-120", "AC-123"]);
    expect(r[0].url).toBe(FRONT_SEARCH_URL + "SU-3320");
  });

  it("does not link inside longer tokens, amounts or unknown numbers", () => {
    expect(refs(linkifyRefs("XAC-1234 AC-12 INV-12 AC-1234X", {}))).toEqual([]);
    expect(refs(linkifyRefs("paid $00201.00 and 00201.5", ctx))).toEqual([]);
    expect(refs(linkifyRefs("bill 99999", ctx))).toEqual([]);
  });

  it("links a bill number inside a HOLD note", () => {
    const parts = linkifyRefs("HOLD - NEED COSTING / 00201", ctx);
    expect(refs(parts).map((x) => x.text)).toEqual(["00201"]);
    expect(parts[0]).toBe("HOLD - NEED COSTING / ");
  });

  it("a supplier invoice in Front but not in Xero links to the Front email", () => {
    expect(resolveRef("BL-8840", ctx)).toMatchObject({ kind: "front-email", url: FRONT_OPEN_URL + "cnv_mail" });
  });

  it("handles empty input and escapes HTML in the email version", () => {
    expect(linkifyRefs("", ctx)).toEqual([]);
    expect(linkifyRefs(null, ctx)).toEqual([]);
    const html = linkifyRefsHtml("<b>AC-6031</b>", ctx);
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('href="https://app.frontapp.com/open/cnv_abc"');
    expect(html).toContain("dotted");
  });
});
