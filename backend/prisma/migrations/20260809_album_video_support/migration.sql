-- Video support for album items.
--
-- type: 'photo' | 'video', validated at the app layer (matches the existing
-- Album.privacy convention of a plain string rather than a Postgres enum).
-- thumbnailUrl: poster frame for a video album item. Generated client-side
-- with expo-video-thumbnails before upload, mirroring messages.thumbnailUrl
-- (20260726_video_and_duration) — the backend never decodes media.

ALTER TABLE "album_photos" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE "album_photos" ADD COLUMN "thumbnailUrl" TEXT;
