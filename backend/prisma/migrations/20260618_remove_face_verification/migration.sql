-- Remove face verification.
--
-- Face verification has been removed from the product. Verified status is now
-- computed as: isVerified = phoneVerified OR emailVerified (verifying via either
-- phone OTP or email OTP is sufficient on its own).
--
-- The `faceVerified` column is intentionally NOT dropped: existing rows may carry
-- meaningful data and other historical references could break on a hard drop.
-- It is simply deprecated — no code path reads or writes it anymore. A future
-- migration may drop it once we are confident nothing depends on it.
--
-- This migration is a no-op at the schema level (the column stays as-is); it
-- exists to record the deprecation decision in the migration history.

-- No DDL. faceVerified retained as deprecated.
COMMENT ON COLUMN "users"."faceVerified" IS 'DEPRECATED (20260618): face verification removed. No longer read/written. isVerified = phoneVerified OR emailVerified.';
