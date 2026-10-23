-- Chunk 5: leakage findings, Xero item mapping, rate snapshots, rate reviews, tasks, notifications, client renewal date
-- CreateEnum
CREATE TYPE "LeakKind" AS ENUM ('UNDER_BILLING', 'WEEKLY_MINIMUM', 'RATE_MISMATCH');

-- CreateEnum
CREATE TYPE "LeakStatus" AS ENUM ('OPEN', 'TASK', 'EXPLAINED', 'RECOVERED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('CPI', 'CARRIER', 'RENEWAL', 'ADHOC');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'SNOOZED', 'DONE');

-- CreateEnum
CREATE TYPE "NoticeState" AS ENUM ('NEW', 'DONE', 'DISMISSED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "renewalDate" DATE;

-- CreateTable
CREATE TABLE "XeroItemMap" (
    "itemCode" TEXT NOT NULL,
    "serviceCode" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroItemMap_pkey" PRIMARY KEY ("itemCode")
);

-- CreateTable
CREATE TABLE "LeakageItem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "LeakKind" NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceCode" TEXT,
    "period" TEXT NOT NULL,
    "expected" DECIMAL(14,2) NOT NULL,
    "billed" DECIMAL(14,2) NOT NULL,
    "gap" DECIMAL(14,2) NOT NULL,
    "working" TEXT NOT NULL,
    "status" "LeakStatus" NOT NULL DEFAULT 'OPEN',
    "cause" TEXT,
    "owner" TEXT,
    "note" TEXT,
    "foundOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAmount" DECIMAL(14,2),
    "recoveredInvoice" TEXT,
    "recoveredOn" DATE,
    "recoveredBy" TEXT,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeakageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateSnapshot" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "asOf" DATE NOT NULL,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateReview" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "owner" TEXT,
    "due" DATE,
    "note" TEXT,
    "newRates" JSONB NOT NULL DEFAULT '{}',
    "target" DECIMAL(5,4),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "where" TEXT,
    "link" TEXT,
    "clientId" TEXT,
    "owner" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "snoozedUntil" TIMESTAMP(3),
    "due" DATE,
    "source" TEXT,
    "verify" JSONB,
    "lastCheck" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "doneNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "payload" JSONB,
    "state" "NoticeState" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeakageItem_key_key" ON "LeakageItem"("key");

-- CreateIndex
CREATE INDEX "LeakageItem_status_idx" ON "LeakageItem"("status");

-- CreateIndex
CREATE INDEX "LeakageItem_clientId_period_idx" ON "LeakageItem"("clientId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "RateSnapshot_source_clientId_serviceCode_key" ON "RateSnapshot"("source", "clientId", "serviceCode");

-- CreateIndex
CREATE INDEX "RateReview_clientId_idx" ON "RateReview"("clientId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_source_idx" ON "Task"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_key_key" ON "Notification"("key");

-- CreateIndex
CREATE INDEX "Notification_state_idx" ON "Notification"("state");
