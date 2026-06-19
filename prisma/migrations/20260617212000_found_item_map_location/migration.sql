-- Add optional campus map metadata for approved found-item pins.
ALTER TABLE "FoundItem" ADD COLUMN "mapFloorId" TEXT;
ALTER TABLE "FoundItem" ADD COLUMN "mapRoomId" TEXT;
ALTER TABLE "FoundItem" ADD COLUMN "mapRoomNumber" TEXT;
ALTER TABLE "FoundItem" ADD COLUMN "mapPinX" DOUBLE PRECISION;
ALTER TABLE "FoundItem" ADD COLUMN "mapPinZ" DOUBLE PRECISION;

CREATE INDEX "FoundItem_status_mapFloorId_mapRoomId_idx" ON "FoundItem"("status", "mapFloorId", "mapRoomId");
CREATE INDEX "FoundItem_mapRoomId_idx" ON "FoundItem"("mapRoomId");
