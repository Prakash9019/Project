-- Disappearing-messages window per conversation (null | '24h' | '7d' | '90d').
-- Idempotent — safe to re-run on the shared Supabase DB.

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "disappearingMessages" TEXT;
