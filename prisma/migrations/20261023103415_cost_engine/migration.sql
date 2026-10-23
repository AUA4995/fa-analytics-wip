-- Chunk 4: pool capacity, service roles, income accounts in mapping, client rates
-- AlterTable
ALTER TABLE "CostPool" ADD COLUMN     "capacity" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "role" TEXT;

-- AlterTable
ALTER TABLE "XeroAccountMap" ADD COLUMN     "side" TEXT NOT NULL DEFAULT 'EXPENSE';

-- CreateTable
CREATE TABLE "ClientRate" (
    "clientId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "validFrom" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRate_pkey" PRIMARY KEY ("clientId","serviceCode")
);
