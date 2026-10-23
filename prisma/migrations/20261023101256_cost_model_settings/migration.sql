-- Chunk 2: cost model settings (sites, clients, pools, services, mapping, suppliers, staff & allocation) + change logs
-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'API_KEY', 'SYNC');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('B2C', 'B2B', 'MIXED');

-- CreateEnum
CREATE TYPE "PoolKind" AS ENUM ('LABOUR', 'OVERHEAD');

-- CreateEnum
CREATE TYPE "MinutesBasis" AS ENUM ('ESTIMATE', 'WMS', 'TIME_STUDY');

-- CreateEnum
CREATE TYPE "CostBehaviour" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('PERMANENT', 'CASUAL', 'AGENCY');

-- CreateEnum
CREATE TYPE "AllocationSource" AS ENUM ('MANUAL', 'WMS');

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "actorName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wmsCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owned" BOOLEAN NOT NULL DEFAULT false,
    "notionalRent" DECIMAL(12,2),
    "palletPositions" INTEGER,
    "labourUtil" DECIMAL(5,4) NOT NULL DEFAULT 0.85,
    "spaceUtil" DECIMAL(5,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "type" "ClientType" NOT NULL DEFAULT 'B2C',
    "sites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "xeroContactId" TEXT,
    "dyspatchCustomerId" TEXT,
    "thomaxTenantId" TEXT,
    "p3lClientId" TEXT,
    "logiwaClientId" TEXT,
    "frontDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clmContractRef" TEXT,
    "weeklyMinimum" DECIMAL(12,2),
    "levyUntil" DATE,
    "cmcShare" DECIMAL(5,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostPool" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PoolKind" NOT NULL,
    "site" TEXT,
    "driver" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostPool_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Service" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "poolKind" TEXT,
    "minutes" DECIMAL(10,3),
    "minutesBasis" "MinutesBasis" NOT NULL DEFAULT 'ESTIMATE',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "overheads" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "XeroAccountMap" (
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT,
    "poolKey" TEXT,
    "treatment" TEXT NOT NULL DEFAULT 'INCLUDE',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroAccountMap_pkey" PRIMARY KEY ("accountCode")
);

-- CreateTable
CREATE TABLE "WmsCodeMap" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tenant" TEXT NOT NULL DEFAULT '',
    "wmsCode" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WmsCodeMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xeroContactId" TEXT,
    "poolKey" TEXT,
    "site" TEXT,
    "behaviour" "CostBehaviour" NOT NULL DEFAULT 'FIXED',
    "rebilled" BOOLEAN NOT NULL DEFAULT false,
    "expectedMonthly" DECIMAL(12,2),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT NOT NULL DEFAULT 'smi',
    "position" TEXT,
    "pool" TEXT NOT NULL DEFAULT 'floor',
    "type" "StaffType" NOT NULL DEFAULT 'PERMANENT',
    "xeroEmployeeId" TEXT,
    "thomaxCode" TEXT,
    "p3lCode" TEXT,
    "logiwaCode" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAllocation" (
    "staffId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "source" "AllocationSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "StaffAllocation_pkey" PRIMARY KEY ("staffId","clientId")
);

-- CreateIndex
CREATE INDEX "ChangeLog_entity_entityId_field_at_idx" ON "ChangeLog"("entity", "entityId", "field", "at");

-- CreateIndex
CREATE INDEX "ChangeLog_at_idx" ON "ChangeLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Client_xeroContactId_key" ON "Client"("xeroContactId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WmsCodeMap_source_tenant_wmsCode_key" ON "WmsCodeMap"("source", "tenant", "wmsCode");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_xeroContactId_key" ON "Supplier"("xeroContactId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_xeroEmployeeId_key" ON "Staff"("xeroEmployeeId");

-- AddForeignKey
ALTER TABLE "XeroAccountMap" ADD CONSTRAINT "XeroAccountMap_poolKey_fkey" FOREIGN KEY ("poolKey") REFERENCES "CostPool"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAllocation" ADD CONSTRAINT "StaffAllocation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAllocation" ADD CONSTRAINT "StaffAllocation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
