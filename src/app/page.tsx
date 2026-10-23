import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Overview — the main dashboard (brief §5): Services margin · Leakage found · Priced below cost · Orders · Break-even.
 * Filled in once the cost engine (chunk 4) and leakage (chunk 5) exist. Never shows made-up numbers.
 */
export default async function OverviewPage() {
  await requireUser();
  const xero = await prisma.xeroConnection.findFirst({ select: { tenantName: true, lastSyncAt: true } }).catch(() => null);
  return (
    <div className="page">
      <PageHeader title="Overview" subtitle="Services margin, leakage, below-cost lines, orders and break-even — once the data is connected." />
      <Card title="Setup">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Xero: {xero ? <>connected to <strong>{xero.tenantName}</strong></> : <>not connected — Settings → Company</>}</li>
          <li>WMS volumes (Thomax, 3PLWMS files, Logiwa): Data sources — chunk 3</li>
          <li>Cost model settings (rules, pools, minutes, staff): Settings — chunk 2</li>
        </ul>
      </Card>
      <EmptyState title="No data yet">The dashboard shows real figures only. It fills in when volumes and Xero data are synced and the cost model is set up.</EmptyState>
    </div>
  );
}
