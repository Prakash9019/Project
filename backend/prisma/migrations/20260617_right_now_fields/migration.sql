-- Migration: Right Now ephemeral status fields
-- Adds rightNowStatus / rightNowCategory / rightNowExpiresAt to users.
-- A status is "active" while rightNowExpiresAt > now(); a sweeper/feed filter
-- treats expired rows as cleared.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rightNowStatus" VARCHAR(120);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rightNowCategory" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rightNowExpiresAt" TIMESTAMP(3);

-- Index to efficiently query the active Right Now feed.
CREATE INDEX IF NOT EXISTS "users_rightNowExpiresAt_idx" ON "users"("rightNowExpiresAt");
