-- Group availability system + room invites.
-- Idempotent statements — safe to re-run on the shared Supabase DB.

-- 1. Availability toggles on the user.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "groupsAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "audioCallAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "videoCallAvailable" BOOLEAN NOT NULL DEFAULT true;

-- 2. Room invite status enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoomInviteStatus') THEN
    CREATE TYPE "RoomInviteStatus" AS ENUM ('pending', 'accepted', 'declined');
  END IF;
END $$;

-- 3. RoomInvite table.
CREATE TABLE IF NOT EXISTS "RoomInvite" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "RoomInviteStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomInvite_roomId_inviterId_inviteeId_key"
    ON "RoomInvite"("roomId", "inviterId", "inviteeId");
CREATE INDEX IF NOT EXISTS "RoomInvite_inviteeId_status_idx"
    ON "RoomInvite"("inviteeId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomInvite_roomId_fkey') THEN
    ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomInvite_inviterId_fkey') THEN
    ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_inviterId_fkey"
      FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomInvite_inviteeId_fkey') THEN
    ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_inviteeId_fkey"
      FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
