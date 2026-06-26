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

/**
 * Generate an Agora RTC token server-side.
 * AGORA_APP_CERTIFICATE must NEVER be exposed to the client.
 *
 * In production a missing certificate or token-builder package is a hard error —
 * we never silently issue an invalid token that would fail at join time. In dev
 * we fall back to a placeholder so the app boots without Agora credentials.
 */
export function generateAgoraToken(channelName: string, uid = 0): string {
  const { appId, appCertificate, tokenExpirySec } = env.agora;

  if (!appCertificate || !RtcTokenBuilder || !RtcRole) {
    if (env.isProd) {
      throw new Error(
        'Agora token generation unavailable: AGORA_APP_CERTIFICATE missing or agora-access-token not installed',
      );
    }
    // Dev/test fallback — NOT valid for real Agora calls.
    return `dev_token_${channelName}_${Date.now()}`;
  }

  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    Math.floor(Date.now() / 1000) + tokenExpirySec,
  );
}

export function makeChannelName(conversationId: string): string {
  return `nearme-${conversationId}-${Date.now()}`;
}
