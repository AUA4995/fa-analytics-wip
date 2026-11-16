-- Batch 3: four roles — primary owner, owners, admins, users (same as the Accounts Hub)
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraOwner" BOOLEAN NOT NULL DEFAULT false;

-- One primary owner (OWNER with extraOwner = false); extra owners allowed. Replaces "User_single_owner".
DROP INDEX IF EXISTS "User_single_owner";
CREATE UNIQUE INDEX "User_single_primary_owner" ON "User" ((true)) WHERE "role" = 'OWNER' AND NOT "extraOwner";
