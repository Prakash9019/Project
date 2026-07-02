import { Resend } from 'resend';
import { env } from '../config/env';

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    if (!env.resend.apiKey) throw new Error('RESEND_API_KEY not set');
    client = new Resend(env.resend.apiKey);
  }
  return client;
}

/** Send a 6-digit login/verification code via Resend. */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const from = env.resend.fromEmail || 'NearMe <noreply@nearme.app>';
  await getClient().emails.send({
    from,
    to,
    subject: 'Your NearMe verification code',
    html: `<div style="font-family:sans-serif;text-align:center;padding:40px">
      <h1 style="color:#F0613B">NearMe</h1>
      <p>Your verification code is:</p>
      <h2 style="font-size:32px;letter-spacing:8px">${code}</h2>
      <p style="color:#888">This code expires in 10 minutes.</p>
    </div>`,
  });
}
