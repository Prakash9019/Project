/**
 * Shared waveform amplitude helpers for voice-note recording + playback.
 * Recording (ChatComposer) samples raw mic metering once per ~100ms for the
 * whole clip; playback (AudioPlayer, rooms MessageBubble) renders a fixed
 * number of bars. Resampling bridges the two so a fixed-size bar count can
 * represent a clip of any length.
 */

/** Resample an amplitude array to exactly `count` values via bucket averaging. */
export function resampleAmplitudes(data: number[], count: number): number[] {
  if (data.length === 0) return Array.from({ length: count }, () => 0.4);
  if (data.length === count) return data;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * data.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * data.length) / count));
    const slice = data.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

/**
 * Parse the amplitude metadata JSON stored alongside a voice message
 * (`caption` for 1:1 chat, `content` for rooms — both otherwise unused for
 * type='voice') and resample it to the player's bar count. Falls back to
 * flat equal-height bars for legacy messages recorded before this metadata
 * existed (never fake random bars).
 */
export function parseVoiceAmplitudes(raw: string | null | undefined, targetCount: number): number[] {
  if (raw) {
    try {
      const meta = JSON.parse(raw);
      if (Array.isArray(meta?.amplitudes) && meta.amplitudes.length > 0) {
        return resampleAmplitudes(meta.amplitudes, targetCount);
      }
    } catch {
      /* not amplitude metadata (legacy message, or unrelated text) */
    }
  }
  return Array.from({ length: targetCount }, () => 0.4);
}
