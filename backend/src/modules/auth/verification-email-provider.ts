import { z } from 'zod';
import { HttpError } from '../../errors.js';

type VerificationEmail = { id: string; to: string; subject: string; text: string };
type SendEmail = (message: VerificationEmail) => Promise<void>;
type DeliveryStage = 'gmail_oauth' | 'gmail_send' | 'resend_send';

const mailbox = z.email().max(254);
const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const oauthErrorResponse = z.object({
  error: z.enum(['invalid_grant', 'invalid_client', 'unauthorized_client', 'invalid_scope']),
});

class DeliveryFailure extends Error {
  constructor(readonly stage: DeliveryStage, readonly reason: string, readonly status?: number) {
    super('Verification email delivery failed');
  }
}

async function providerRequest(stage: DeliveryStage, url: string, options: RequestInit) {
  try {
    return await fetch(url, { ...options, redirect: 'error' });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'transport';
    throw new DeliveryFailure(stage, reason);
  }
}

function providerName(env: NodeJS.ProcessEnv) {
  const value = env.OTP_EMAIL_PROVIDER?.trim().toLowerCase() || 'resend';
  return value === 'gmail' || value === 'resend' ? value : 'invalid';
}

export function verificationEmailUnavailable(requestId: string, failure?: unknown) {
  const provider = providerName(process.env);
  const details = failure instanceof DeliveryFailure
    ? `stage=${failure.stage} reason=${failure.reason}${failure.status ? ` status=${failure.status}` : ''}`
    : `reason=${failure === undefined ? 'configuration' : 'unexpected'}`;
  console.warn(`[otp-mail] provider=${provider} ${details} request_id=${requestId}`);
  return new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Chưa thể gửi mã xác minh. Vui lòng thử lại sau.');
}

export function logVerificationEmailAccepted(requestId: string) {
  console.info(`[otp-mail] provider=${providerName(process.env)} stage=accepted request_id=${requestId}`);
}

function gmailSender(env: NodeJS.ProcessEnv): SendEmail | undefined {
  const from = mailbox.safeParse(env.GMAIL_SENDER_EMAIL?.trim());
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim();
  if (!from.success || !clientId || !clientSecret || !refreshToken) return undefined;

  let cached: { token: string; expiresAt: number } | undefined;
  const accessToken = async (signal: AbortSignal) => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const response = await providerRequest('gmail_oauth', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken,
      }),
      signal,
    });
    if (!response.ok) {
      const failure = oauthErrorResponse.safeParse(await response.json().catch(() => null));
      throw new DeliveryFailure('gmail_oauth', failure.success ? failure.data.error : 'rejected', response.status);
    }
    const token = tokenResponse.safeParse(await response.json().catch(() => null));
    if (!token.success) throw new DeliveryFailure('gmail_oauth', 'invalid_response');
    cached = { token: token.data.access_token, expiresAt: Date.now() + token.data.expires_in * 1000 };
    return cached.token;
  };

  return async ({ to, subject, text }) => {
    const recipient = mailbox.parse(to);
    const encodedSubject = Buffer.from(subject, 'utf8').toString('base64');
    const bodyLines = Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g) ?? [];
    const mime = [
      `From: PlantCare <${from.data}>`,
      `To: ${recipient}`,
      `Subject: =?UTF-8?B?${encodedSubject}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      ...bodyLines,
      '',
    ].join('\r\n');

    const signal = AbortSignal.timeout(10_000);
    const body = JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') });
    const send = (token: string) => providerRequest('gmail_send', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      signal,
    });

    let token = await accessToken(signal);
    let response = await send(token);
    await response.body?.cancel().catch(() => {});
    if (response.status === 401) {
      if (cached?.token === token) cached = undefined;
      token = await accessToken(signal);
      response = await send(token);
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 && cached?.token === token) cached = undefined;
    }
    if (!response.ok) throw new DeliveryFailure('gmail_send', 'rejected', response.status);
  };
}

export function configuredVerificationEmail(env: NodeJS.ProcessEnv = process.env): SendEmail | undefined {
  const provider = providerName(env);
  if (provider === 'gmail') return gmailSender(env);
  if (provider !== 'resend') return undefined;

  const key = env.RESEND_API_KEY?.trim();
  const from = env.OTP_EMAIL_FROM?.trim();
  if (!key || !from) return undefined;

  return async ({ id, to, subject, text }) => {
    const send = () => providerRequest('resend_send', 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'Idempotency-Key': id },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal,
    });
    const signal = AbortSignal.timeout(8_000);
    let response = await send();
    await response.body?.cancel().catch(() => {});
    if (response.status >= 500) {
      response = await send();
      await response.body?.cancel().catch(() => {});
    }
    if (!response.ok) throw new DeliveryFailure('resend_send', 'rejected', response.status);
  };
}
