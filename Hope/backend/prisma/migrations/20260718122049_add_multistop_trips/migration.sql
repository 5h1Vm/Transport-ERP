-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "loadId" TEXT;

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLoad" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "originStopId" TEXT NOT NULL,
    "destinationStopId" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "weightTons" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freightPerTon" DECIMAL(65,30),
    "commissionType" "CommissionType" NOT NULL,
    "commissionValue" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripLoad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripStop_tripId_sequence_idx" ON "TripStop"("tripId", "sequence");

-- CreateIndex
CREATE INDEX "TripLoad_tripId_idx" ON "TripLoad"("tripId");

-- CreateIndex
CREATE INDEX "TripLoad_transporterId_idx" ON "TripLoad"("transporterId");

-- CreateIndex
CREATE INDEX "Payment_loadId_idx" ON "Payment"("loadId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "TripLoad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLoad" ADD CONSTRAINT "TripLoad_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLoad" ADD CONSTRAINT "TripLoad_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "TripStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLoad" ADD CONSTRAINT "TripLoad_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "TripStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLoad" ADD CONSTRAINT "TripLoad_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "Transporter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

