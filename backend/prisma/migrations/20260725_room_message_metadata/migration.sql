-- Opaque JSON metadata field for room messages (e.g. voice-note waveform
-- amplitudes) — never rendered as message content, unlike `content`.
ALTER TABLE "RoomMessage" ADD COLUMN "metadata" TEXT;
