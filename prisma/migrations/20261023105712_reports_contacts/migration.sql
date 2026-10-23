-- Chunk 6: contacts & recipients, saved reports and their sends
-- CreateEnum
CREATE TYPE "RecipientList" AS ENUM ('INTERNAL', 'CLIENT', 'LENDER');

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "list" "RecipientList" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "clientId" TEXT,
    "role" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "cls" TEXT NOT NULL DEFAULT 'INTERNAL',
    "clientId" TEXT,
    "forecast" BOOLEAN NOT NULL DEFAULT false,
    "costing" TEXT NOT NULL DEFAULT 'B',
    "schedule" TEXT NOT NULL DEFAULT 'OFF',
    "sendTime" TEXT NOT NULL DEFAULT '07:30',
    "mode" TEXT NOT NULL DEFAULT 'DRY_RUN',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSend" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,
    "to" TEXT[],
    "subject" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "frontId" TEXT,
    "by" TEXT NOT NULL,

    CONSTRAINT "ReportSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_list_email_key" ON "Recipient"("list", "email");

-- CreateIndex
CREATE INDEX "ReportSend_reportId_at_idx" ON "ReportSend"("reportId", "at");

-- AddForeignKey
ALTER TABLE "ReportSend" ADD CONSTRAINT "ReportSend_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
