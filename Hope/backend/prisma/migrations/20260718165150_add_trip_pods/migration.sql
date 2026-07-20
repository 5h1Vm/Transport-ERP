-- CreateTable
CREATE TABLE "TripPod" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "stopId" TEXT,
    "location" TEXT,
    "note" TEXT,
    "imageUrl" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripPod_tripId_idx" ON "TripPod"("tripId");

-- AddForeignKey
ALTER TABLE "TripPod" ADD CONSTRAINT "TripPod_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPod" ADD CONSTRAINT "TripPod_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "TripStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

