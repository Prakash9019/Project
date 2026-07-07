-- Message delivery tracking (WhatsApp-style ticks).
-- Idempotent statements — safe to re-run on the shared Supabase DB.

-- 1:1 chat: per-message delivered timestamp (double-grey tick).
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

-- Room chat: per-message delivered timestamp (kept for parity/analytics).
ALTER TABLE "RoomMessage" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

-- Room chat: per-member delivery receipts. A room message is "delivered"
-- (double grey) once at least one OTHER member has received it.
CREATE TABLE IF NOT EXISTS "RoomMessageDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMessageDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomMessageDelivery_messageId_userId_key"
    ON "RoomMessageDelivery"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "RoomMessageDelivery_messageId_idx"
    ON "RoomMessageDelivery"("messageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'RoomMessageDelivery_messageId_fkey'
  ) THEN
    ALTER TABLE "RoomMessageDelivery"
      ADD CONSTRAINT "RoomMessageDelivery_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "RoomMessage"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
