import { env } from '../config/env';

/**
 * SMS delivery for OTP codes.
 * TODO: wire a real provider (Twilio / MSG91 / Vonage). Inject credentials via env and
 * replace the stub body with the provider SDK call.
 */
export interface SmsAdapter {
  sendOtp(phone: string, code: string): Promise<void>;
}

class StubSmsAdapter implements SmsAdapter {
  async sendOtp(phone: string, code: string): Promise<void> {
    // In dev we don't actually send; the code is surfaced in the API response instead.
    if (!env.isProd) {
      // eslint-disable-next-line no-console
      console.log(`[sms:stub] OTP for ${phone} = ${code}`);
    }
    // TODO: await twilioClient.messages.create({ to: phone, from, body: `Your code is ${code}` })
  }
}

export const sms: SmsAdapter = new StubSmsAdapter();
