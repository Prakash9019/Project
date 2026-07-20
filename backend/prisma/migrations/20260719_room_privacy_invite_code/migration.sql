-- Public / private groups.
--   isPrivate  → private groups are hidden from Discover, joinable only via an
--                invite link or an admin add, and only admins may add members.
--   inviteCode → shareable join-link token (unique) generated for every room;
--                the only way to join a private room without an admin add.
-- Idempotent — safe to re-run on the shared Supabase DB.

ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Room_inviteCode_key" ON "Room" ("inviteCode");
