import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.email.host,
  port: env.email.port,
  auth: env.email.user ? { user: env.email.user, pass: env.email.pass } : undefined,
});

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!env.isProd && !env.email.user) {
    // Dev: log OTP to console instead of sending
    // eslint-disable-next-line no-console
    console.log(`[email stub] To: ${to} | Subject: ${subject} | Body: ${text}`);
    return;
  }
  await transporter.sendMail({ from: env.email.from, to, subject, text });
}
