-- Group (Dating Room) audio/video calling — extends the 1:1 Call/Agora
-- architecture to rooms via RoomCall/RoomCallParticipant.
-- Also adds per-category notification preference columns to user_settings
-- so Settings → Notifications persists server-side instead of only AsyncStorage.
-- Idempotent — safe to re-run on the shared Supabase DB.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoomCallStatus') THEN
    CREATE TYPE "RoomCallStatus" AS ENUM ('ongoing', 'ended');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RoomCall" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "status" "RoomCallStatus" NOT NULL DEFAULT 'ongoing',
    "agoraChannelName" TEXT NOT NULL,
    "agoraToken" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "RoomCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoomCall_roomId_status_idx" ON "RoomCall"("roomId", "status");

CREATE TABLE IF NOT EXISTS "RoomCallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "RoomCallParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomCallParticipant_callId_userId_key" ON "RoomCallParticipant"("callId", "userId");
CREATE INDEX IF NOT EXISTS "RoomCallParticipant_callId_idx" ON "RoomCallParticipant"("callId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomCall_roomId_fkey') THEN
    ALTER TABLE "RoomCall" ADD CONSTRAINT "RoomCall_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomCall_initiatorId_fkey') THEN
    ALTER TABLE "RoomCall" ADD CONSTRAINT "RoomCall_initiatorId_fkey"
      FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomCallParticipant_callId_fkey') THEN
    ALTER TABLE "RoomCallParticipant" ADD CONSTRAINT "RoomCallParticipant_callId_fkey"
      FOREIGN KEY ("callId") REFERENCES "RoomCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RoomCallParticipant_userId_fkey') THEN
    ALTER TABLE "RoomCallParticipant" ADD CONSTRAINT "RoomCallParticipant_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Notification preferences (Settings → Notifications), previously AsyncStorage-only.
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyMessages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyPreview" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifySound" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyVibrate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyReactions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyMissedCalls" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyGroupMessages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyMemberActivity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notifyMentionsOnly" BOOLEAN NOT NULL DEFAULT false;
