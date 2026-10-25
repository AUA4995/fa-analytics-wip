-- Sessions: 8-hour cap, idle lock after 60 minutes
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "capAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
