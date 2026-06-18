-- Migration: Replace phone-only auth with Firebase Auth (email/Google)
-- phone becomes nullable so Firebase-only users have no phone
-- New fields: firebase_uid, email, email_verified

-- Make phone nullable (existing rows keep their values)
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

-- Add Firebase auth fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firebase_uid" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_key" ON "users"("firebase_uid");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
