-- Starred messages + 1:1 pin + "delete for me" flags.
-- Idempotent — safe to re-run on the shared Supabase DB.

-- Pin + per-side "delete for me" on 1:1 messages.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "isPinned"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deletedByA" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deletedByB" BOOLEAN NOT NULL DEFAULT false;

-- Starred messages (works for both 1:1 and room messages via `type`).
CREATE TABLE IF NOT EXISTS "starred_messages" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'chat',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "starred_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "starred_messages_userId_messageId_key" ON "starred_messages"("userId", "messageId");
CREATE INDEX IF NOT EXISTS "starred_messages_userId_idx" ON "starred_messages"("userId");

DO $$ BEGIN
  ALTER TABLE "starred_messages"
    ADD CONSTRAINT "starred_messages_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
