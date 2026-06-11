-- Auth
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Grid & discovery
CREATE INDEX IF NOT EXISTS idx_users_grid ON users("isOnGrid", "lastActiveAt", plan)
  WHERE "isOnGrid" = true;

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_userA ON conversations("userAId", "lastMessageAt" DESC)
  WHERE "aDeletedAt" IS NULL AND "aIsHidden" = false;
CREATE INDEX IF NOT EXISTS idx_conversations_userB ON conversations("userBId", "lastMessageAt" DESC)
  WHERE "bDeletedAt" IS NULL AND "bIsHidden" = false;

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages("conversationId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

-- Blocks (bidirectional lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_pair ON blocks("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS idx_blocks_reverse ON blocks("blockedId", "blockerId");

-- User interactions (free-tier cap)
CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_pair ON user_interactions("actorId", "targetId");
CREATE INDEX IF NOT EXISTS idx_interactions_actor ON user_interactions("actorId");

-- Add-on purchases
CREATE INDEX IF NOT EXISTS idx_addons_active ON add_on_purchases("userId", "isActive", "expiresAt")
  WHERE "isActive" = true;

-- Profile views
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON profile_views("viewedId", "createdAt" DESC);

-- Taps
CREATE INDEX IF NOT EXISTS idx_taps_receiver ON taps("receiverId", "createdAt" DESC);

-- Album photos
CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos("albumId", "order" ASC);

-- City profiles
CREATE INDEX IF NOT EXISTS idx_city_profiles_user ON city_profiles("userId", "isActive");

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON subscriptions("userId", active, "expiresAt")
  WHERE active = true;

-- Refresh tokens (from previous migration, add for safety)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens("userId");
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens("family");
