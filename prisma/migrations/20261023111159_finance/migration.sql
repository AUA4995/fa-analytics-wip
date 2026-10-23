-- Finance: balance sheet by month, supplier bills, due amounts, debt schedule
-- AlterTable
ALTER TABLE "XeroSale" ADD COLUMN     "amountDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" DATE;

-- CreateTable
CREATE TABLE "XeroBalance" (
    "month" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroBalance_pkey" PRIMARY KEY ("month","accountId")
);

-- CreateTable
CREATE TABLE "XeroBill" (
    "xeroId" TEXT NOT NULL,
    "number" TEXT,
    "reference" TEXT,
    "contactId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "status" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "amountDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroBill_pkey" PRIMARY KEY ("xeroId")
);

-- CreateTable
CREATE TABLE "XeroBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "description" TEXT,
    "itemCode" TEXT,
    "accountCode" TEXT,
    "quantity" DECIMAL(14,4),
    "unitAmount" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "XeroBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtFacility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT,
    "limit" DECIMAL(14,2),
    "balance" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(6,4),
    "principalMonthly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "endDate" DATE,
    "security" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtFacility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XeroBill_contactId_date_idx" ON "XeroBill"("contactId", "date");

-- CreateIndex
CREATE INDEX "XeroBill_date_idx" ON "XeroBill"("date");

-- CreateIndex
CREATE INDEX "XeroBillLine_billId_idx" ON "XeroBillLine"("billId");

-- CreateIndex
CREATE INDEX "XeroBillLine_itemCode_idx" ON "XeroBillLine"("itemCode");

-- AddForeignKey
ALTER TABLE "XeroBillLine" ADD CONSTRAINT "XeroBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "XeroBill"("xeroId") ON DELETE CASCADE ON UPDATE CASCADE;
