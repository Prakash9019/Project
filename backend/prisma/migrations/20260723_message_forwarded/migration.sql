-- Add "Forward message" tracking fields to messages
ALTER TABLE "messages" ADD COLUMN "isForwarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "forwardedFromId" TEXT;
