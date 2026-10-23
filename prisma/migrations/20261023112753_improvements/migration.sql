-- Improvements & savings: ideas → initiatives, steps, comments, categories
-- CreateTable
CREATE TABLE "ImproveCategory" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImproveCategory_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Improvement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "sub" TEXT,
    "detail" TEXT,
    "changes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stage" TEXT NOT NULL DEFAULT 'IDEA',
    "reviewer" TEXT,
    "reviewDue" DATE,
    "horizon" TEXT NOT NULL DEFAULT 'SHORT',
    "priority" INTEGER,
    "owner" TEXT,
    "startDate" DATE,
    "dueDate" DATE,
    "savingType" TEXT NOT NULL DEFAULT 'HARD',
    "calc" JSONB NOT NULL DEFAULT '[]',
    "estMonthly" DECIMAL(14,2),
    "measuredMonthly" DECIMAL(14,2),
    "monthsConfirmed" INTEGER NOT NULL DEFAULT 0,
    "investment" DECIMAL(14,2),
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verifiedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Improvement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImproveStep" (
    "id" TEXT NOT NULL,
    "improvementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start" DATE,
    "due" DATE,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "kind" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImproveStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImproveComment" (
    "id" TEXT NOT NULL,
    "improvementId" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImproveComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Improvement_stage_idx" ON "Improvement"("stage");

-- CreateIndex
CREATE INDEX "ImproveStep_improvementId_idx" ON "ImproveStep"("improvementId");

-- AddForeignKey
ALTER TABLE "ImproveStep" ADD CONSTRAINT "ImproveStep_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "Improvement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImproveComment" ADD CONSTRAINT "ImproveComment_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "Improvement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
