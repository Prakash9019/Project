-- Phase 6: Safety enforcement fields on User and Photo

-- User: ban, restriction, interaction penalty fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "restrictedUntil" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interactionPenaltyUntil" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interactionPenaltyMultiplier" DOUBLE PRECISION DEFAULT 1.0;

-- Photo: moderation review flag
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;
