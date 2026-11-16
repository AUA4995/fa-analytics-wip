-- Batch 1: Thomax Query API raw mirror (connection, tables, rows, lookup refs)
-- CreateTable
CREATE TABLE "ThomaxConnection" (
    "id" TEXT NOT NULL DEFAULT 'thomax',
    "cluster" TEXT NOT NULL DEFAULT 'e',
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "historyFrom" DATE NOT NULL DEFAULT '2021-01-01'::date,
    "recheckDays" INTEGER NOT NULL DEFAULT 14,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThomaxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThomaxTable" (
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL DEFAULT 'TRANSACTIONAL',
    "fields" JSONB,
    "sample" JSONB,
    "exploredAt" TIMESTAMP(3),
    "dateField" TEXT,
    "keyFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lookupFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "historyDoneTo" DATE,
    "maxSeen" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThomaxTable_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "ThomaxRow" (
    "id" BIGSERIAL NOT NULL,
    "table" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThomaxRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThomaxRef" (
    "id" BIGSERIAL NOT NULL,
    "rowId" BIGINT NOT NULL,
    "value" TEXT NOT NULL,
    "field" TEXT NOT NULL,

    CONSTRAINT "ThomaxRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThomaxRow_table_at_idx" ON "ThomaxRow"("table", "at");

-- CreateIndex
CREATE UNIQUE INDEX "ThomaxRow_table_key_key" ON "ThomaxRow"("table", "key");

-- CreateIndex
CREATE INDEX "ThomaxRef_value_idx" ON "ThomaxRef"("value");

-- CreateIndex
CREATE INDEX "ThomaxRef_rowId_idx" ON "ThomaxRef"("rowId");

-- AddForeignKey
ALTER TABLE "ThomaxRow" ADD CONSTRAINT "ThomaxRow_table_fkey" FOREIGN KEY ("table") REFERENCES "ThomaxTable"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThomaxRef" ADD CONSTRAINT "ThomaxRef_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "ThomaxRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
