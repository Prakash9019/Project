-- "Hosting" flag for a Right Now status. Previously the create-sheet toggle was
-- cosmetic (never persisted); the host badge was inferred from status text /
-- category. Now it is an explicit user choice sent with PATCH /me.

ALTER TABLE "users" ADD COLUMN "rightNowHosting" BOOLEAN NOT NULL DEFAULT false;
