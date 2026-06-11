-- Migration: all_changes_v3
-- Covers: Change 1 (blocking), Change 2 (call flags), Change 3 (verification),
--         Change 4 (inactivity), Change 5 (user card fields), Change 6 (interaction limit),
--         Change 7 (album feature)

-- ─────────────────────────────────────────────────────────
-- New enum types
-- ─────────────────────────────────────────────────────────

CREATE TYPE "SkinTone" AS ENUM (
  'very_fair', 'fair', 'medium', 'olive', 'brown', 'dark', 'prefer_not_to_say'
);

CREATE TYPE "RelationshipStatus" AS ENUM (
  'single', 'committed', 'open_relationship', 'prefer_not_to_say'
);

CREATE TYPE "LookingForOption" AS ENUM (
  'fwb', 'one_night', 'long_term', 'short_term', 'casual', 'friendship'
);

CREATE TYPE "WhereWeCanMeet" AS ENUM (
  'my_place', 'your_place', 'restaurant', 'cafe', 'hotel', 'outdoors', 'virtual'
);

-- ─────────────────────────────────────────────────────────
-- Update existing enums — add new values
-- ─────────────────────────────────────────────────────────

-- BodyType: add heavyset, prefer_not_to_say (canonical new values per Change 5)
ALTER TYPE "BodyType" ADD VALUE IF NOT EXISTS 'heavyset';
ALTER TYPE "BodyType" ADD VALUE IF NOT EXISTS 'prefer_not_to_say';

-- MessageType: add voice_note
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'voice_note';

-- CallStatus: add initiated, ongoing
ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'initiated';
ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'ongoing';

-- VerificationStatus: add none, verified
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'none';
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'verified';

-- ─────────────────────────────────────────────────────────
-- Change 1: Blocking system — conversation visibility flags
-- ─────────────────────────────────────────────────────────

-- Add hidden flags to conversations (soft-hide on block)
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aIsHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "bIsHidden" BOOLEAN NOT NULL DEFAULT false;

-- Add reverse-lookup index on blocks for bidirectional block checks (Change 1.2)
CREATE INDEX IF NOT EXISTS "blocks_blockedId_blockerId_idx" ON "blocks"("blockedId", "blockerId");

-- ─────────────────────────────────────────────────────────
-- Change 2: Replace callUnlocked with per-side reply flags
-- ─────────────────────────────────────────────────────────

-- Add new reply flags
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aHasReplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "bHasReplied" BOOLEAN NOT NULL DEFAULT false;

-- Remove old callUnlocked field
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "callUnlocked";

-- ─────────────────────────────────────────────────────────
-- Change 4: Remove old daily-limit fields (replaced by UserInteraction)
-- ─────────────────────────────────────────────────────────

ALTER TABLE "users" DROP COLUMN IF EXISTS "dailyNewChatCount";
ALTER TABLE "users" DROP COLUMN IF EXISTS "dailyNewChatResetDate";

-- ─────────────────────────────────────────────────────────
-- Change 5: User card fields — new profile fields
-- ─────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "skinTone"           "SkinTone";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aboutMe"            VARCHAR(500);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whereAreYouFrom"    TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "relationshipStatus" "RelationshipStatus";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whereWeCanMeet"     "WhereWeCanMeet"[] NOT NULL DEFAULT ARRAY[]::"WhereWeCanMeet"[];
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences"        TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fantasyTags"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Extend bio field length (plan-enforced at app layer, DB allows max)
ALTER TABLE "users" ALTER COLUMN "bio" TYPE VARCHAR(600);

-- ─────────────────────────────────────────────────────────
-- Change 6: UserInteraction — free-tier lifetime cap tracking
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_interactions" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "actorId"         TEXT         NOT NULL,
  "targetId"        TEXT         NOT NULL,
  "interactionType" TEXT         NOT NULL DEFAULT 'message',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_interactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_interactions"
  ADD CONSTRAINT "user_interactions_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_interactions"
  ADD CONSTRAINT "user_interactions_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "user_interactions_actorId_targetId_key"
  ON "user_interactions"("actorId", "targetId");

CREATE INDEX IF NOT EXISTS "user_interactions_actorId_idx"
  ON "user_interactions"("actorId");

-- ─────────────────────────────────────────────────────────
-- Change 7: Album feature — new models
-- ─────────────────────────────────────────────────────────

-- album_photos must be created before albums (FK dependency)
CREATE TABLE IF NOT EXISTS "album_photos" (
  "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "albumId"   TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "photoUrl"  TEXT         NOT NULL,
  "order"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "album_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "albums" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "userId"       TEXT         NOT NULL,
  "title"        VARCHAR(50)  NOT NULL,
  "coverPhotoId" TEXT         UNIQUE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- FK constraints
ALTER TABLE "albums"
  ADD CONSTRAINT "albums_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "albums"
  ADD CONSTRAINT "albums_coverPhotoId_fkey"
  FOREIGN KEY ("coverPhotoId") REFERENCES "album_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "album_photos"
  ADD CONSTRAINT "album_photos_albumId_fkey"
  FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "album_photos"
  ADD CONSTRAINT "album_photos_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "albums_userId_idx"           ON "albums"("userId");
CREATE INDEX IF NOT EXISTS "album_photos_albumId_order_idx" ON "album_photos"("albumId", "order");
CREATE INDEX IF NOT EXISTS "album_photos_userId_idx"     ON "album_photos"("userId");
