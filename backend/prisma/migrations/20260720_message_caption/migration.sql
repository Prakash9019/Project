-- Image captions for 1:1 chat: an image + caption is ONE message (WhatsApp-style),
-- not two separate messages. Nullable — images without a caption remain valid.
-- Idempotent — safe to re-run on the shared Supabase DB.

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "caption" VARCHAR(1000);
