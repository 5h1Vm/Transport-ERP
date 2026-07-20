-- AlterTable
ALTER TABLE "DriverSettlement" ADD COLUMN     "fundedByTransporterId" TEXT;

-- CreateIndex
CREATE INDEX "DriverSettlement_fundedByTransporterId_idx" ON "DriverSettlement"("fundedByTransporterId");

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_fundedByTransporterId_fkey" FOREIGN KEY ("fundedByTransporterId") REFERENCES "Transporter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

