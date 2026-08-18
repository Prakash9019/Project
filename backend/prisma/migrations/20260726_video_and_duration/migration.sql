-- Inline video messages + real voice/video duration.
--
-- thumbnailUrl: poster frame for a video message. Generated client-side with
-- expo-video-thumbnails before upload; the backend only stores what it is given
-- (an R2 object key or a hosted URL — signUrl() presigns keys on read).
--
-- duration: playback length in SECONDS for voice/video messages. Previously
-- unrecoverable client-side, because the waveform persisted with a voice note is
-- resampled to a fixed bar count and so no longer encodes the clip length.

ALTER TABLE "messages" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "messages" ADD COLUMN "duration" INTEGER;

ALTER TABLE "RoomMessage" ADD COLUMN "duration" INTEGER;
