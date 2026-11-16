-- Batch 3: rent by space type, break-even behaviour per account, weighted ticket types and weekly scores
-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "bayPositions" INTEGER,
ADD COLUMN     "binPositions" INTEGER;

-- AlterTable
ALTER TABLE "XeroAccountMap" ADD COLUMN     "behaviour" TEXT;

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrontTicketWeek" (
    "clientId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "tickets" INTEGER NOT NULL,
    "score" DECIMAL(12,2) NOT NULL,
    "supportScore" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "accountsScore" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "byType" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrontTicketWeek_pkey" PRIMARY KEY ("clientId","week")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_name_key" ON "TicketType"("name");
