-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'nonbinary', 'other');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('free', 'basic', 'advanced', 'vip');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('slim', 'athletic', 'average', 'curvy', 'heavyset', 'prefer_not_to_say', 'muscular', 'plus_size', 'other');

-- CreateEnum
CREATE TYPE "SkinTone" AS ENUM ('very_fair', 'fair', 'medium', 'olive', 'brown', 'dark', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('single', 'committed', 'open_relationship', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "LookingForOption" AS ENUM ('fwb', 'one_night', 'long_term', 'short_term', 'casual', 'friendship');

-- CreateEnum
CREATE TYPE "WhereWeCanMeet" AS ENUM ('my_place', 'your_place', 'restaurant', 'cafe', 'hotel', 'outdoors', 'virtual');

-- CreateEnum
CREATE TYPE "DatingIntention" AS ENUM ('casual_dates', 'intimacy_no_commitment', 'life_partner', 'ethical_non_monogamy', 'marriage', 'friendship', 'virtual_dating');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('single', 'dating', 'open_relationship', 'married', 'complicated', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('pending', 'active', 'dismissed');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'photo', 'video', 'voice', 'expiring_photo', 'voice_note');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('audio', 'video');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('ringing', 'accepted', 'declined', 'missed', 'canceled', 'ended', 'initiated', 'ongoing');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('photo', 'face');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'approved', 'rejected', 'none', 'verified');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('spam', 'harassment', 'fake_profile', 'inappropriate_content', 'lgbtq_hate', 'other');

-- CreateEnum
CREATE TYPE "GenderIdentity" AS ENUM ('man', 'woman', 'non_binary', 'trans_man', 'trans_woman', 'genderqueer', 'genderfluid', 'other');

-- CreateEnum
CREATE TYPE "SexualOrientation" AS ENUM ('straight', 'gay', 'lesbian', 'bisexual', 'queer', 'pansexual', 'other');

-- CreateEnum
CREATE TYPE "WantToSee" AS ENUM ('men', 'women', 'everyone', 'non_binary_people');

-- CreateEnum
CREATE TYPE "RelationshipIntent" AS ENUM ('dating', 'friendship', 'networking', 'open_to_anything');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'premium', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'three_month', 'six_month', 'annual');

-- CreateEnum
CREATE TYPE "AddOnType" AS ENUM ('boost_local', 'boost_extended', 'boost_city_wide', 'mega_boost', 'spotlight', 'chat_pack_s', 'chat_pack_m', 'chat_pack_l', 'travel_pass', 'travel_pass_week', 'verified_badge', 'audio_call_topup', 'video_call_topup');

-- CreateEnum
CREATE TYPE "ModerationFlagType" AS ENUM ('explicit_sexual', 'threat', 'hate_speech', 'anti_lgbtq', 'nudity', 'spam');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "age" INTEGER,
    "gender" "Gender",
    "bio" VARCHAR(600),
    "height" INTEGER,
    "weight" INTEGER,
    "bodyType" "BodyType",
    "relationshipType" "RelationshipType",
    "skinTone" "SkinTone",
    "aboutMe" VARCHAR(500),
    "whereAreYouFrom" TEXT,
    "relationshipStatus" "RelationshipStatus",
    "whereWeCanMeet" "WhereWeCanMeet"[],
    "preferences" TEXT,
    "fantasyTags" TEXT[],
    "lookingFor" TEXT[],
    "datingIntentions" "DatingIntention"[],
    "interests" TEXT[],
    "topArtists" TEXT[],
    "tribes" TEXT[],
    "tags" TEXT[],
    "virtualDatingBadge" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "photoVerified" BOOLEAN NOT NULL DEFAULT false,
    "faceVerified" BOOLEAN NOT NULL DEFAULT false,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'free',
    "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "pinHash" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "genderIdentity" "GenderIdentity",
    "genderIdentityOther" TEXT,
    "sexualOrientation" "SexualOrientation",
    "wantToSee" "WantToSee"[],
    "relationshipIntent" "RelationshipIntent",
    "whoCanDiscoverMe" "WantToSee"[],
    "firstName" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "planExpiresAt" TIMESTAMP(3),
    "voiceClipUrl" TEXT,
    "videoClipUrl" TEXT,
    "verifiedBadge" BOOLEAN NOT NULL DEFAULT false,
    "isCollegeVerified" BOOLEAN NOT NULL DEFAULT false,
    "profileCompletenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationUpdatedAt" TIMESTAMP(3),
    "isOnGrid" BOOLEAN NOT NULL DEFAULT true,
    "incognitoMode" BOOLEAN NOT NULL DEFAULT false,
    "hideActiveStatus" BOOLEAN NOT NULL DEFAULT false,
    "hideLastSeen" BOOLEAN NOT NULL DEFAULT false,
    "hideExactDistance" BOOLEAN NOT NULL DEFAULT false,
    "showOrientationPublicly" BOOLEAN NOT NULL DEFAULT false,
    "disceetMode" BOOLEAN NOT NULL DEFAULT false,
    "pauseIncomingMessages" BOOLEAN NOT NULL DEFAULT false,
    "requireProfileCompletenessToMessage" BOOLEAN NOT NULL DEFAULT false,
    "verifiedUsersOnlyFilter" BOOLEAN NOT NULL DEFAULT false,
    "dailyAudioMinutesUsed" INTEGER NOT NULL DEFAULT 0,
    "dailyVideoMinutesUsed" INTEGER NOT NULL DEFAULT 0,
    "dailyCallMinutesResetDate" TIMESTAMP(3),
    "historicalReplyRate" DOUBLE PRECISION,
    "aiOptInFeatures" JSONB,
    "restrictedUntil" TIMESTAMP(3),
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "interactionPenaltyUntil" TIMESTAMP(3),
    "interactionPenaltyMultiplier" DOUBLE PRECISION DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "albumId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_prompts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" VARCHAR(120) NOT NULL,
    "answer" VARCHAR(300) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "userId" TEXT NOT NULL,
    "verifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "proximityShrink" BOOLEAN NOT NULL DEFAULT false,
    "stealthMode" BOOLEAN NOT NULL DEFAULT false,
    "discoverable" BOOLEAN NOT NULL DEFAULT true,
    "showDistance" BOOLEAN NOT NULL DEFAULT true,
    "locationDealbreaker" BOOLEAN NOT NULL DEFAULT false,
    "nationwideMode" BOOLEAN NOT NULL DEFAULT false,
    "incognito" BOOLEAN NOT NULL DEFAULT false,
    "appIcon" TEXT NOT NULL DEFAULT 'default',
    "screenshotBlock" BOOLEAN NOT NULL DEFAULT false,
    "blockOffensiveLanguage" BOOLEAN NOT NULL DEFAULT false,
    "activeLast5MinFilter" BOOLEAN NOT NULL DEFAULT false,
    "recentlyJoinedFilter" BOOLEAN NOT NULL DEFAULT false,
    "highReplyRateFilter" BOOLEAN NOT NULL DEFAULT false,
    "activeLast30MinFilter" BOOLEAN NOT NULL DEFAULT false,
    "customDistanceKm" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'pending',
    "aHasReplied" BOOLEAN NOT NULL DEFAULT false,
    "bHasReplied" BOOLEAN NOT NULL DEFAULT false,
    "aIsHidden" BOOLEAN NOT NULL DEFAULT false,
    "bIsHidden" BOOLEAN NOT NULL DEFAULT false,
    "aPinned" BOOLEAN NOT NULL DEFAULT false,
    "bPinned" BOOLEAN NOT NULL DEFAULT false,
    "aArchivedAt" TIMESTAMP(3),
    "bArchivedAt" TIMESTAMP(3),
    "aDeletedAt" TIMESTAMP(3),
    "bDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'text',
    "ciphertext" TEXT,
    "content" TEXT,
    "mediaUrls" TEXT[],
    "mediaUrl" TEXT,
    "viewOnce" BOOLEAN NOT NULL DEFAULT false,
    "expiresInSeconds" INTEGER,
    "viewedAt" TIMESTAMP(3),
    "expiresAfterView" BOOLEAN NOT NULL DEFAULT false,
    "isUnsent" BOOLEAN NOT NULL DEFAULT false,
    "unsentAt" TIMESTAMP(3),
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "originalContent" TEXT,
    "translatedContent" TEXT,
    "flaggedOffensive" BOOLEAN NOT NULL DEFAULT false,
    "moderationFlagged" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'ringing',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "conversationId" TEXT,
    "agoraChannelName" TEXT,
    "agoraToken" TEXT,
    "durationSeconds" INTEGER,
    "endReason" TEXT,
    "scheduledAt" TIMESTAMP(3),

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_phrases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_phrases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taps" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_views" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_albums" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Private Album',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_album_grants" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_album_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "coverPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_photos" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "mediaUrl" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "externalRef" TEXT,
    "plan" "Plan",
    "billingCycle" "BillingCycle",
    "priceInr" INTEGER,
    "paymentProvider" TEXT,
    "providerSubscriptionId" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallets" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_boosts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "geohash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mutes" (
    "id" TEXT NOT NULL,
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addOnType" "AddOnType" NOT NULL,
    "priceInr" INTEGER NOT NULL,
    "chatSlotsAdded" INTEGER,
    "audioMinutesAdded" INTEGER,
    "videoMinutesAdded" INTEGER,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "add_on_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "visitingSoonBadge" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "city_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_flags" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "flagType" "ModerationFlagType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_interactions" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL DEFAULT 'message',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_lastActiveAt_idx" ON "users"("lastActiveAt");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_plan_idx" ON "users"("plan");

-- CreateIndex
CREATE INDEX "users_isOnGrid_lastActiveAt_idx" ON "users"("isOnGrid", "lastActiveAt");

-- CreateIndex
CREATE INDEX "photos_userId_idx" ON "photos"("userId");

-- CreateIndex
CREATE INDEX "photos_albumId_idx" ON "photos"("albumId");

-- CreateIndex
CREATE INDEX "profile_prompts_userId_idx" ON "profile_prompts"("userId");

-- CreateIndex
CREATE INDEX "conversations_userAId_lastMessageAt_idx" ON "conversations"("userAId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_userBId_lastMessageAt_idx" ON "conversations"("userBId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_userAId_userBId_key" ON "conversations"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "calls_callerId_startedAt_idx" ON "calls"("callerId", "startedAt");

-- CreateIndex
CREATE INDEX "calls_calleeId_startedAt_idx" ON "calls"("calleeId", "startedAt");

-- CreateIndex
CREATE INDEX "saved_phrases_userId_idx" ON "saved_phrases"("userId");

-- CreateIndex
CREATE INDEX "favorites_userId_idx" ON "favorites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_favoriteId_key" ON "favorites"("userId", "favoriteId");

-- CreateIndex
CREATE INDEX "taps_receiverId_createdAt_idx" ON "taps"("receiverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "taps_senderId_receiverId_key" ON "taps"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "profile_views_viewedId_createdAt_idx" ON "profile_views"("viewedId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "profile_views_viewerId_viewedId_key" ON "profile_views"("viewerId", "viewedId");

-- CreateIndex
CREATE INDEX "private_albums_ownerId_idx" ON "private_albums"("ownerId");

-- CreateIndex
CREATE INDEX "private_album_grants_granteeId_idx" ON "private_album_grants"("granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "private_album_grants_albumId_granteeId_key" ON "private_album_grants"("albumId", "granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "albums_coverPhotoId_key" ON "albums"("coverPhotoId");

-- CreateIndex
CREATE INDEX "albums_userId_idx" ON "albums"("userId");

-- CreateIndex
CREATE INDEX "album_photos_albumId_order_idx" ON "album_photos"("albumId", "order");

-- CreateIndex
CREATE INDEX "album_photos_userId_idx" ON "album_photos"("userId");

-- CreateIndex
CREATE INDEX "verifications_userId_type_idx" ON "verifications"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_createdAt_idx" ON "credit_ledger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "feed_boosts_userId_expiresAt_idx" ON "feed_boosts"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "blocks_blockedId_blockerId_idx" ON "blocks"("blockedId", "blockerId");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blockerId_blockedId_key" ON "blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "reports_reportedId_idx" ON "reports"("reportedId");

-- CreateIndex
CREATE INDEX "mutes_muterId_idx" ON "mutes"("muterId");

-- CreateIndex
CREATE UNIQUE INDEX "mutes_muterId_mutedId_key" ON "mutes"("muterId", "mutedId");

-- CreateIndex
CREATE INDEX "add_on_purchases_userId_isActive_idx" ON "add_on_purchases"("userId", "isActive");

-- CreateIndex
CREATE INDEX "add_on_purchases_userId_expiresAt_idx" ON "add_on_purchases"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "message_templates_userId_idx" ON "message_templates"("userId");

-- CreateIndex
CREATE INDEX "city_profiles_userId_idx" ON "city_profiles"("userId");

-- CreateIndex
CREATE INDEX "moderation_flags_targetType_targetId_idx" ON "moderation_flags"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "moderation_flags_status_createdAt_idx" ON "moderation_flags"("status", "createdAt");

-- CreateIndex
CREATE INDEX "user_interactions_actorId_idx" ON "user_interactions"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "user_interactions_actorId_targetId_key" ON "user_interactions"("actorId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "private_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_prompts" ADD CONSTRAINT "profile_prompts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_phrases" ADD CONSTRAINT "saved_phrases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taps" ADD CONSTRAINT "taps_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taps" ADD CONSTRAINT "taps_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewedId_fkey" FOREIGN KEY ("viewedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_albums" ADD CONSTRAINT "private_albums_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_album_grants" ADD CONSTRAINT "private_album_grants_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "private_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_album_grants" ADD CONSTRAINT "private_album_grants_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "album_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "credit_wallets"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_boosts" ADD CONSTRAINT "feed_boosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_purchases" ADD CONSTRAINT "add_on_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city_profiles" ADD CONSTRAINT "city_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hardening Partial Indexes
CREATE INDEX IF NOT EXISTS idx_users_grid ON users("isOnGrid", "lastActiveAt", plan)
  WHERE "isOnGrid" = true;

CREATE INDEX IF NOT EXISTS idx_conversations_userA ON conversations("userAId", "lastMessageAt" DESC)
  WHERE "aDeletedAt" IS NULL AND "aIsHidden" = false;
CREATE INDEX IF NOT EXISTS idx_conversations_userB ON conversations("userBId", "lastMessageAt" DESC)
  WHERE "bDeletedAt" IS NULL AND "bIsHidden" = false;

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages("conversationId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_addons_active ON add_on_purchases("userId", "isActive", "expiresAt")
  WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON subscriptions("userId", active, "expiresAt")
  WHERE active = true;
