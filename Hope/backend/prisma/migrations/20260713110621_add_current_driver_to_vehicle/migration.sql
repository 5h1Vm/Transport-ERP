-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "currentDriverId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_currentDriverId_key" ON "Vehicle"("currentDriverId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_currentDriverId_fkey" FOREIGN KEY ("currentDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

