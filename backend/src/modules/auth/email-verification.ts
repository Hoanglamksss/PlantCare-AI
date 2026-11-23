import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow, emailCodeLimit, emailCodeResendSeconds } from './throttle.js';
import { configuredVerificationEmail, logVerificationEmailAccepted, verificationEmailUnavailable } from './verification-email-provider.js';

const invalidCode = () => new HttpError(400, 'EMAIL_CODE_INVALID', 'Mã sai, đã hết hạn hoặc đã dùng. Hãy kiểm tra mã mới nhất.');

export function createEmailVerificationRouter(pool: Pool, secret: string, requireSession: RequestHandler, requireCsrf: RequestHandler) {
  const router = Router();
  const sendEmail = configuredVerificationEmail();
  const sends = new AttemptWindow(5);
  const ipSends = new AttemptWindow(20);
  const scope = [requireSession, requireCsrf];

  function digest(owner: string, id: string, email: string, code: string) {
    return createHmac('sha256', secret).update(JSON.stringify(['email-verification', owner, id, email, code])).digest('hex');
  }

  router.get('/auth/email-verification', requireSession, async (req, res) => {
    const { rows: [account] } = await pool.query<{ verified: boolean }>(
      'SELECT email_xac_minh_luc IS NOT NULL AS verified FROM accounts WHERE id = $1',
      [req.auth!.user.id],
    );
    res.json({ verified: account?.verified ?? false, enabled: Boolean(sendEmail) });
  });

  router.post('/auth/email-verification/send', ...scope, async (req, res) => {
    if (!sendEmail) throw verificationEmailUnavailable(res.locals.requestId);
    const { id: owner, email } = req.auth!.user;
    const cooldown = Math.max(sends.retryAfter(owner), ipSends.retryAfter(req.ip ?? 'unknown'));
    if (cooldown) {
      throw emailCodeLimit(cooldown, 'Bạn đã gửi nhiều yêu cầu. Hãy thử lại sau.');
    }

    const id = randomUUID();
    const code = String(randomInt(1_000_000)).padStart(6, '0');
    const { rowCount } = await pool.query(`
      INSERT INTO email_verification_codes (tai_khoan_id, id, email, code_digest, expires_at)
      SELECT id, $2, email, $3, clock_timestamp() + interval '10 minutes'
      FROM accounts WHERE id = $1 AND email = $4 AND email_xac_minh_luc IS NULL AND yeu_cau_xoa_luc IS NULL
      ON CONFLICT (tai_khoan_id) DO UPDATE
        SET id = EXCLUDED.id, email = EXCLUDED.email, code_digest = EXCLUDED.code_digest,
          sent_at = EXCLUDED.sent_at, expires_at = EXCLUDED.expires_at, attempts = 0
        WHERE email_verification_codes.email <> EXCLUDED.email
          OR email_verification_codes.sent_at <= clock_timestamp() - $5::int * interval '1 second'
    `, [owner, id, digest(owner, id, email, code), email, emailCodeResendSeconds]);
    if (!rowCount) {
      const { rows: [account] } = await pool.query<{ verified: boolean; retry_after: number }>(`
        SELECT a.email_xac_minh_luc IS NOT NULL AS verified,
          GREATEST(1, CEIL($3::int + EXTRACT(EPOCH FROM c.sent_at - clock_timestamp())))::int AS retry_after
        FROM accounts a LEFT JOIN email_verification_codes c ON c.tai_khoan_id = a.id AND c.email = a.email
        WHERE a.id = $1 AND a.email = $2
      `, [owner, email, emailCodeResendSeconds]);
      if (account?.verified) { res.json({ verified: true }); return; }
      throw emailCodeLimit(account?.retry_after ?? 1, 'Vui lòng đợi trước khi gửi lại mã.');
    }

    try {
      await sendEmail({
        id, to: email, subject: 'Mã xác minh email PlantCare',
        text: `Mã xác minh PlantCare của bạn là ${code}. Mã có hiệu lực trong 10 phút và chỉ dùng một lần.`,
      });
    } catch (failure) {
      const unavailable = verificationEmailUnavailable(res.locals.requestId, failure);
      await pool.query('DELETE FROM email_verification_codes WHERE tai_khoan_id = $1 AND id = $2', [owner, id]);
      throw unavailable;
    }
    logVerificationEmailAccepted(res.locals.requestId);
    res.json({ verified: false, sent: true });
  });

  router.post('/auth/email-verification/confirm', ...scope, async (req, res) => {
    const parsed = z.strictObject({ code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parsed.success) throw invalidCode();
    const { id: owner, email } = req.auth!.user;
    const client = await pool.connect();
    let verified = false;
    try {
      await client.query('BEGIN');
      const { rows: [account] } = await client.query<{ verified: boolean }>(`
        SELECT email_xac_minh_luc IS NOT NULL AS verified FROM accounts
        WHERE id = $1 AND email = $2 AND yeu_cau_xoa_luc IS NULL FOR UPDATE
      `, [owner, email]);
      if (account && !account.verified) {
        const { rows: [row] } = await client.query<{ id: string; digest: string }>(`
          UPDATE email_verification_codes SET attempts = attempts + 1
          WHERE tai_khoan_id = $1 AND email = $2 AND expires_at > clock_timestamp() AND attempts < 5
          RETURNING id, code_digest AS digest
        `, [owner, email]);
        if (row && timingSafeEqual(Buffer.from(row.digest, 'hex'), Buffer.from(digest(owner, row.id, email, parsed.data.code), 'hex'))) {
          await client.query('UPDATE accounts SET email_xac_minh_luc = clock_timestamp() WHERE id = $1', [owner]);
          await client.query('DELETE FROM email_verification_codes WHERE tai_khoan_id = $1', [owner]);
          verified = true;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (!verified) throw invalidCode();
    res.json({ verified: true });
  });

  return router;
}

export async function requireVerifiedEmailForCommunity(pool: Pool, accountId: string) {
  if (process.env.COMMUNITY_REQUIRE_VERIFIED_EMAIL !== 'true') return;
  const result = await pool.query(
    'SELECT 1 FROM accounts WHERE id = $1 AND email_xac_minh_luc IS NOT NULL AND yeu_cau_xoa_luc IS NULL',
    [accountId],
  );
  if (!result.rowCount) throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Hãy xác minh email trong Hồ sơ trước khi đăng bài hoặc bình luận.');
}
