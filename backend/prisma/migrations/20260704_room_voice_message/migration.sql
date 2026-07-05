-- Add 'voice' to the RoomMessageType enum for room voice notes.
-- ADD VALUE IF NOT EXISTS is idempotent and safe on the shared Supabase DB.
ALTER TYPE "RoomMessageType" ADD VALUE IF NOT EXISTS 'voice';
