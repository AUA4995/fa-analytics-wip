-- Batch 4: revenue protection case log
-- CreateTable
CREATE TABLE "RevenueCase" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "amountBefore" DECIMAL(14,2),
    "amountAfter" DECIMAL(14,2),
    "pending" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "stoppedBy" TEXT,
    "carNumber" TEXT,
    "lessons" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevenueCase_date_idx" ON "RevenueCase"("date");

-- The first two cases Asal recorded (project file FA_Revenue_Protection_Cases.md, 09–11/11/2026). Figures as given;
-- anything still to confirm is in "pending" and the case stays OPEN.
INSERT INTO "RevenueCase" ("id", "date", "clientName", "title", "kind", "whatHappened", "amountBefore", "amountAfter", "pending", "status", "stoppedBy", "lessons", "createdBy", "updatedAt") VALUES
('rpc_mwu_nz_pallet', '2026-11-09', 'MWU (My Way Up)', 'NZ order short one pallet — DHL Express avoided', 'COST_AVOIDED',
 'An NZ order was sent one pallet short. Staff planned to send the missing pallet by DHL Express at FA''s cost (~$4,000). Asal stopped it and arranged air freight through a broker (general cargo) instead: ~$1,400 plus NZ domestic delivery. Waiting for space on the next flight.',
 4000.00, 1400.00, 'NZ domestic delivery cost (add it to "actual"); flight confirmation; whose error caused the short shipment (FA → CAR, client → recharge MWU)', 'OPEN', 'Asal', NULL, 'Asal', CURRENT_TIMESTAMP),
('rpc_ryde_kitting', '2026-11-10', 'Ryde', 'Ryde kitting — labour hire at half the quoted speed', 'LOSS',
 'Quoted $1.05 per kit on 60 kits per hour per person ($48/h ÷ 60 = $0.80 labour per kit). Two Tetris labour hire staff ($48/h ex GST, 7.5 h shifts) had no KPI and estimated 2 days for 1,000 kits (~33 kits/h each). Asal raised it on day 1; the KPI was not given and they worked at their own pace. Labour at that pace: 30 h × $48 = $1,440 for 1,000 kits ($1.44 a kit) against $1,050 billed — a $390 loss, and $640 more than the quote assumed ($800). Also fixed: finished kits now go straight onto skids (no double handling from trolleys).',
 1050.00, 1440.00, 'Kits actually completed (billed = kits × $1.05); hours on the Tetris invoice', 'OPEN', 'Asal (raised, not actioned)',
 'No KPI given to labour hire; quote assumptions not shared with the floor; no first-hour output check; the agreed action (KPI) was not carried out or checked; storage of finished kits not planned. CAR candidate: "special project start" checklist with a named owner.', 'Asal', CURRENT_TIMESTAMP);
