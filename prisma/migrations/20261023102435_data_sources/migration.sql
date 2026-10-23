-- Chunk 3: data sources — WMS volumes and orders, Xero sales / P&L / payroll mirror, Front ticket counts, source runs
-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,
    "startedBy" TEXT,

    CONSTRAINT "SourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeImport" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT,
    "checksum" TEXT,
    "mapping" JSONB,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "dateFrom" DATE,
    "dateTo" DATE,
    "replaced" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolumeImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeLine" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tenant" TEXT NOT NULL,
    "wmsCode" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "VolumeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFact" (
    "id" TEXT NOT NULL,
    "importId" TEXT,
    "source" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tenant" TEXT NOT NULL,
    "warehouse" TEXT,
    "skus" INTEGER NOT NULL,
    "units" DECIMAL(12,2) NOT NULL,
    "orderType" TEXT,

    CONSTRAINT "OrderFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroContact" (
    "xeroId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroContact_pkey" PRIMARY KEY ("xeroId")
);

-- CreateTable
CREATE TABLE "XeroSale" (
    "xeroId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT,
    "reference" TEXT,
    "contactId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroSale_pkey" PRIMARY KEY ("xeroId")
);

-- CreateTable
CREATE TABLE "XeroSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "description" TEXT,
    "itemCode" TEXT,
    "accountCode" TEXT,
    "quantity" DECIMAL(14,4),
    "unitAmount" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "XeroSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroPnl" (
    "month" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroPnl_pkey" PRIMARY KEY ("month","accountId")
);

-- CreateTable
CREATE TABLE "PayrollEmployee" (
    "xeroId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmployee_pkey" PRIMARY KEY ("xeroId")
);

-- CreateTable
CREATE TABLE "PayRun" (
    "xeroId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "paymentDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("xeroId")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "xeroId" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "super" DECIMAL(12,2) NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("xeroId")
);

-- CreateTable
CREATE TABLE "FrontTicketMonth" (
    "clientId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "tickets" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrontTicketMonth_pkey" PRIMARY KEY ("clientId","month")
);

-- CreateIndex
CREATE INDEX "SourceRun_source_startedAt_idx" ON "SourceRun"("source", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeImport_checksum_key" ON "VolumeImport"("checksum");

-- CreateIndex
CREATE INDEX "VolumeLine_date_idx" ON "VolumeLine"("date");

-- CreateIndex
CREATE INDEX "VolumeLine_tenant_date_idx" ON "VolumeLine"("tenant", "date");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeLine_source_tenant_date_wmsCode_warehouse_key" ON "VolumeLine"("source", "tenant", "date", "wmsCode", "warehouse");

-- CreateIndex
CREATE INDEX "OrderFact_tenant_date_idx" ON "OrderFact"("tenant", "date");

-- CreateIndex
CREATE INDEX "OrderFact_date_idx" ON "OrderFact"("date");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFact_source_orderRef_key" ON "OrderFact"("source", "orderRef");

-- CreateIndex
CREATE INDEX "XeroSale_contactId_date_idx" ON "XeroSale"("contactId", "date");

-- CreateIndex
CREATE INDEX "XeroSale_date_idx" ON "XeroSale"("date");

-- CreateIndex
CREATE INDEX "XeroSaleLine_saleId_idx" ON "XeroSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "XeroSaleLine_itemCode_idx" ON "XeroSaleLine"("itemCode");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- AddForeignKey
ALTER TABLE "VolumeLine" ADD CONSTRAINT "VolumeLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "VolumeImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFact" ADD CONSTRAINT "OrderFact_importId_fkey" FOREIGN KEY ("importId") REFERENCES "VolumeImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XeroSaleLine" ADD CONSTRAINT "XeroSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "XeroSale"("xeroId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("xeroId") ON DELETE CASCADE ON UPDATE CASCADE;
