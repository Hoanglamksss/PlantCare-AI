import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow, emailCodeLimit, emailCodeResendSeconds } from './throttle.js';
import { configuredVerificationEmail, logVerificationEmailAccepted, verificationEmailUnavailable } from './verification-email-provider.js';

type Scope = { purpose: 'register' | 'change'; subject: string; email: string };
export const emailProof = { challengeId: z.uuid().transform(id => id.toLowerCase()), code: z.string().regex(/^\d{6}$/) };
const emailLimit = new AttemptWindow(4);
const ipLimit = new AttemptWindow(20);
export const invalidEmailProof = () => new HttpError(400, 'EMAIL_CODE_INVALID', 'Mã xác minh không hợp lệ hoặc đã hết hạn. Kiểm tra mã mới nhất hoặc gửi lại.');

export function accountEmailChallenges(pool: Pool, secret: string) {
  const deliver = configuredVerificationEmail();
  const digest = (scope: Scope, id: string, code: string) => createHmac('sha256', secret)
    .update(JSON.stringify(['account-email', scope.purpose, scope.subject, scope.email, id, code])).digest('hex');

  return {
    async send(scope: Scope, ip: string, requestId: string) {
      if (!deliver) throw verificationEmailUnavailable(requestId);
      const cooldown = ipLimit.retryAfter(ip) || emailLimit.retryAfter(scope.email);
      if (cooldown) {
        throw emailCodeLimit(cooldown, 'Bạn đã gửi nhiều yêu cầu. Hãy thử lại sau.');
      }
      const id = randomUUID();
      const code = String(randomInt(1_000_000)).padStart(6, '0');
      const occupied = await pool.query('SELECT 1 FROM accounts WHERE email = $1', [scope.email]);
      if (occupied.rowCount) {
        if (scope.purpose === 'change') throw new HttpError(409, 'EMAIL_IN_USE', 'Email này đã được sử dụng.');
        return id;
      }

      await pool.query("DELETE FROM account_email_challenges WHERE expires_at < clock_timestamp() - interval '1 day'");
      const reservation = await pool.query(`
        INSERT INTO account_email_challenges (id, purpose, subject, email, code_digest, expires_at)
        VALUES ($1, $2, $3, $4, $5, clock_timestamp() + interval '10 minutes')
        ON CONFLICT (purpose, subject, email) DO UPDATE
          SET id = EXCLUDED.id, code_digest = EXCLUDED.code_digest, expires_at = EXCLUDED.expires_at,
            sent_at = EXCLUDED.sent_at, attempts = 0
          WHERE account_email_challenges.sent_at <= clock_timestamp() - $6::int * interval '1 second'
      `, [id, scope.purpose, scope.subject, scope.email, digest(scope, id, code), emailCodeResendSeconds]);
      if (!reservation.rowCount) {
        const { rows: [entry] } = await pool.query<{ retry_after: number }>(`
          SELECT GREATEST(1, CEIL($4::int + EXTRACT(EPOCH FROM sent_at - clock_timestamp())))::int AS retry_after
          FROM account_email_challenges WHERE purpose = $1 AND subject = $2 AND email = $3
        `, [scope.purpose, scope.subject, scope.email, emailCodeResendSeconds]);
        throw emailCodeLimit(entry?.retry_after ?? 1, 'Vui lòng đợi trước khi gửi lại mã.');
      }

      try {
        await deliver({ id, to: scope.email, subject: 'Mã xác minh PlantCare',
          text: `Mã ${scope.purpose === 'register' ? 'đăng ký' : 'đổi email'} PlantCare là ${code}. Mã có hiệu lực trong 10 phút và chỉ dùng một lần.` });
      } catch (failure) {
        const unavailable = verificationEmailUnavailable(requestId, failure);
        await pool.query('DELETE FROM account_email_challenges WHERE id = $1', [id]);
        throw unavailable;
      }
      logVerificationEmailAccepted(requestId);
      return id;
    },
    async consume(client: PoolClient, scope: Scope, proof: { challengeId: string; code: string }) {
      const { rows: [entry] } = await client.query<{ digest: string }>(`
        UPDATE account_email_challenges SET attempts = attempts + 1
        WHERE id = $1 AND purpose = $2 AND subject = $3 AND email = $4
          AND attempts < 5 AND expires_at > clock_timestamp()
        RETURNING code_digest AS digest
      `, [proof.challengeId, scope.purpose, scope.subject, scope.email]);
      if (!entry || !timingSafeEqual(Buffer.from(entry.digest, 'hex'), Buffer.from(digest(scope, proof.challengeId, proof.code), 'hex'))) return false;
      await client.query('DELETE FROM account_email_challenges WHERE id = $1', [proof.challengeId]);
      return true;
    },
  };
}
