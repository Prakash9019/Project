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
 * Real Agora tokens are mandatory — placeholder dev_tokens cause Agora SDK error 109/110
 * and silent connection timeouts. We throw immediately if credentials or the token builder
 * are missing.
 */
export function generateAgoraToken(channelName: string, uid = 0): string {
  const { appId, appCertificate, tokenExpirySec } = env.agora;

  if (!appId || !appCertificate) {
    throw new Error(
      `Agora token generation failed: AGORA_APP_ID or AGORA_APP_CERTIFICATE is missing in environment variables. Real Agora credentials are required for calls.`
    );
  }

  if (!RtcTokenBuilder || !RtcRole) {
    throw new Error(
      `Agora token generation failed: 'agora-access-token' library is not loaded. Please ensure 'agora-access-token' is installed in node_modules.`
    );
  }

  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + tokenExpirySec;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs,
  );

  return token;
}

export function makeChannelName(conversationId: string): string {
  return `nearme-${conversationId}-${Date.now()}`;
}
