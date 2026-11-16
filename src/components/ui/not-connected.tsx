import Link from "next/link";
import { sourceDef, type SourceKey } from "@/lib/sources/registry";
import { Pill } from "./pill";

/**
 * "Not connected" flag (batch 2): put next to any number that depends on another app that isn't connected yet,
 * saying what is used until then. Links to API connections, where every source is listed.
 */
export function NotConnected({ source, until }: { source: SourceKey; until?: string }) {
  const d = sourceDef(source);
  const fallback = until ?? d.affects[0]?.until;
  return (
    <span className="small">
      <Pill tone="amber" title={d.needs}>
        {d.name}: not connected
      </Pill>{" "}
      {fallback && <span className="meta">until then: {fallback} · </span>}
      <Link href="/apis" className="lnk">
        details
      </Link>
    </span>
  );
}
