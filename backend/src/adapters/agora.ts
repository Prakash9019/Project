import { env } from '../config/env';

// agora-access-token is an optional peer dependency — gracefully degrade in dev without certs
let RtcTokenBuilder: { buildTokenWithUid: (appId: string, appCert: string, channelName: string, uid: number, role: number, expireTime: number) => string } | null = null;
let RtcRole: { PUBLISHER: number } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const agora = require('agora-access-token');
  RtcTokenBuilder = agora.RtcTokenBuilder;
  RtcRole = agora.RtcRole;
} catch {
  // package not installed or cert missing — dev fallback
}

const AGORA_APP_ID = process.env.AGORA_APP_ID ?? '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE ?? '';
const TOKEN_EXPIRY_SECONDS = 3600;

/**
 * Generate an Agora RTC token server-side.
 * AGORA_APP_CERTIFICATE must NEVER be exposed to the client.
 * Falls back to a dev placeholder if certificate is not configured.
 */
export function generateAgoraToken(channelName: string, uid = 0): string {
  if (!AGORA_APP_CERTIFICATE || !RtcTokenBuilder || !RtcRole) {
    // Dev/test fallback — not valid for real Agora calls
    return `dev_token_${channelName}_${Date.now()}`;
  }
  return RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
  );
}

export function makeChannelName(conversationId: string): string {
  return `nearme-${conversationId}-${Date.now()}`;
}
