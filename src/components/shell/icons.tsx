import type { ReactNode } from "react";
import type { PageKey } from "@/components/ui/sections";

/** Line icons on a 24px grid (stroke 1.8, round caps), same style as the confirmed demo. */
const PATHS: Partial<Record<PageKey, string>> = {
  overview: "M3 13h8V3H3z|M13 21h8V11h-8z|M3 21h8v-6H3z|M13 3v6h8V3z",
  operations: "M3 9l9-6 9 6v12H3z|M7 21v-8h10v8|M7 17h10",
  cost: "M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3z|M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6|M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  leakage: "M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0C18 9.3 12 2.7 12 2.7z",
  revenue: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z|M9 12l2 2 4-4",
  improve: "M3 17l6-6 4 4 8-8|M14 7h7v7",
  reports: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z|M14 3v6h6|M8 17v-3|M12 17v-6|M16 17v-4",
  kpi: "M12 2a10 10 0 1 0 10 10|M12 12l6-6|C12,12,2",
  finance: "M3 21h18|M5 21V10|M19 21V10|M9 21V10|M15 21V10|M2 10l10-6 10 6z",
  tasks: "M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  data: "M3 5c0 1.7 4 3 9 3s9-1.3 9-3-4-3-9-3-9 1.3-9 3z|M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5|M3 12c0 1.7 4 3 9 3s9-1.3 9-3",
  apis: "M9 17H7A5 5 0 0 1 7 7h2|M15 7h2a5 5 0 1 1 0 10h-2|M8 12h8",
  settings: "M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6",
};

function fromPaths(spec: string): ReactNode[] {
  return spec.split("|").map((d, i) => {
    if (d.startsWith("R")) {
      const [x, y, w, h, rx = "2"] = d.slice(1).split(",");
      return <rect key={i} x={x} y={y} width={w} height={h} rx={rx} />;
    }
    if (d.startsWith("C")) {
      const [cx, cy, r] = d.slice(1).split(",");
      return <circle key={i} cx={cx} cy={cy} r={r} />;
    }
    return <path key={i} d={d} />;
  });
}

/** Menu icon (24px grid, stroke). Same size in the pinned menu and the collapsed icon rail. */
export function PageIcon({ page }: { page: PageKey }) {
  const art = fromPaths(PATHS[page] ?? "");
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden data-icon={page}>
      {art}
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 10.76V5h6v5.76l2.5 3.24h-11z" />
      <path d="M8 3h8" />
    </svg>
  );
}

export function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
