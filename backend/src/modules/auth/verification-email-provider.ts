import { z } from 'zod';

type VerificationEmail = { id: string; to: string; subject: string; text: string };
type SendEmail = (message: VerificationEmail) => Promise<void>;

const mailbox = z.email().max(254);
const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

function gmailSender(env: NodeJS.ProcessEnv): SendEmail | undefined {
  const from = mailbox.safeParse(env.GMAIL_SENDER_EMAIL?.trim());
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim();
  if (!from.success || !clientId || !clientSecret || !refreshToken) return undefined;

  let cached: { token: string; expiresAt: number } | undefined;
  const accessToken = async (signal: AbortSignal) => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken,
      }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Gmail OAuth refresh failed');
    }
    const token = tokenResponse.parse(await response.json());
    cached = { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
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
    const token = await accessToken(signal);
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
      signal,
      redirect: 'error',
    });
    await response.body?.cancel();
    if (response.status === 401) cached = undefined;
    if (!response.ok) throw new Error('Gmail send failed');
  };
}

export function configuredVerificationEmail(env: NodeJS.ProcessEnv = process.env): SendEmail | undefined {
  const provider = env.OTP_EMAIL_PROVIDER?.trim() || 'resend';
  if (provider === 'gmail') return gmailSender(env);
  if (provider !== 'resend') return undefined;

  const key = env.RESEND_API_KEY?.trim();
  const from = env.OTP_EMAIL_FROM?.trim();
  if (!key || !from) return undefined;

  return async ({ id, to, subject, text }) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'Idempotency-Key': id },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Resend send failed');
  };
}
