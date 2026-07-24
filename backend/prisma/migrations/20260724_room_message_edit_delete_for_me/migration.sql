-- Room message edit + per-member "delete for me" parity with 1:1 chat
ALTER TABLE "RoomMessage" ADD COLUMN "isEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoomMessage" ADD COLUMN "originalContent" TEXT;
ALTER TABLE "RoomMessage" ADD COLUMN "hiddenForUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
