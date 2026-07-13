-- AlterEnum
ALTER TYPE "SettlementType" ADD VALUE 'EXPENSE_REIMBURSEMENT';

-- AlterTable: remove commission from Transporter
ALTER TABLE "Transporter" DROP COLUMN "commissionType",
DROP COLUMN "commissionValue";

-- AlterTable: make commission required on Trip — backfill existing NULLs first
UPDATE "Trip" SET "commissionType" = 'PERCENTAGE' WHERE "commissionType" IS NULL;
UPDATE "Trip" SET "commissionValue" = 0 WHERE "commissionValue" IS NULL;
ALTER TABLE "Trip" ALTER COLUMN "commissionType" SET NOT NULL,
ALTER COLUMN "commissionValue" SET NOT NULL;