import { env } from '../config/env';

export interface SmsAdapter {
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * MSG91 OTP adapter.
 * Requires env vars: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_SENDER_ID (optional, default PROXIM).
 * Phone is converted from E.164 (+919876543210) to MSG91 format (919876543210).
 */
class Msg91SmsAdapter implements SmsAdapter {
  private readonly authKey: string;
  private readonly templateId: string;
  private readonly senderId: string;

  constructor(authKey: string, templateId: string, senderId: string) {
    this.authKey = authKey;
    this.templateId = templateId;
    this.senderId = senderId;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    // Strip leading '+' for MSG91 (expects country code without +)
    const mobile = phone.replace(/^\+/, '');

    const response = await fetch('https://api.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'authkey': this.authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: this.templateId,
        mobile,
        otp: code,
        sender: this.senderId,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`MSG91 OTP send failed (${response.status}): ${body}`);
    }
  }
}

class StubSmsAdapter implements SmsAdapter {
  async sendOtp(phone: string, code: string): Promise<void> {
    // Always log so the code is visible in server/docker logs during development.
    // eslint-disable-next-line no-console
    console.log(`[sms:stub] OTP for ${phone} = ${code}`);
  }
}

function createSmsAdapter(): SmsAdapter {
  const { msg91AuthKey, msg91TemplateId, msg91SenderId } = env.sms;
  if (msg91AuthKey && msg91TemplateId) {
    return new Msg91SmsAdapter(msg91AuthKey, msg91TemplateId, msg91SenderId);
  }
  if (env.isProd) {
    // eslint-disable-next-line no-console
    console.warn('[sms] MSG91_AUTH_KEY / MSG91_TEMPLATE_ID not set — OTPs will not be delivered. Set these env vars for production SMS.');
  }
  return new StubSmsAdapter();
}

export const sms: SmsAdapter = createSmsAdapter();
