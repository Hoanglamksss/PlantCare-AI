import { hash, verify } from '@node-rs/argon2';
import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { accountEmail, currentPassword, newPassword, passwordOptions, passwordValidationError, rejectCredentialRate, withPasswordWork } from '../auth/credentials.js';
import { accountEmailChallenges, emailProof, invalidEmailProof } from '../auth/account-email-challenge.js';
import { AttemptWindow } from '../auth/throttle.js';
import { reservePhoto, type PhotoReservation } from '../media/photos.js';
import { MissingPhoto, type PhotoServices } from '../media/services.js';
import { photoUpload, type PhotoUploadSlots } from '../media/upload.js';
import { profileDisplayName, profilePhone } from './fields.js';

const profileUpdate = z.strictObject({
  displayName: profileDisplayName.nullable().optional(),
  phone: profilePhone.nullable().optional(),
}).refine((value) => value.displayName !== undefined || value.phone !== undefined);
const credentialsUpdate = z.strictObject({
  currentPassword,
  email: accountEmail.optional(),
  newPassword: newPassword.optional(),
  challengeId: emailProof.challengeId.optional(),
  code: emailProof.code.optional(),
}).refine((value) => value.email !== undefined || value.newPassword !== undefined);
const avatarQuery = z.strictObject({ version: z.uuid().optional() });
const readAvatar = photoUpload(32);

interface AccountCredentials {
  email: string;
  passwordHash: string;
}

interface ProfileRow {
  email: string;
  displayName: string | null;
  phone: string | null;
  avatarId: string | null;
}

const profileColumns = 'ten_hien_thi AS "displayName", so_dien_thoai AS phone, anh_id AS "avatarId"';
const unauthorized = () => new HttpError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập.');
const avatarMissing = () => new HttpError(404, 'AVATAR_NOT_FOUND', 'Không tìm thấy ảnh đại diện.');
const avatarUnavailable = () => new HttpError(503, 'AVATAR_UNAVAILABLE', 'Dịch vụ ảnh đại diện đang bận hoặc tạm gián đoạn. Vui lòng thử lại.');

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw passwordValidationError(result.error)
      ?? new HttpError(400, 'INVALID_INPUT', 'Dữ liệu hồ sơ không hợp lệ.');
  }
  return result.data;
}

function profileResponse({ avatarId, ...profile }: ProfileRow) {
  return {
    ...profile,
    avatarUrl: avatarId ? `/api/v1/profile/avatar?version=${avatarId}` : null,
  };
}

async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function changeCredentials(
  pool: Pool, owner: string, tokenHash: string, input: z.infer<typeof credentialsUpdate>,
  challenges: ReturnType<typeof accountEmailChallenges>,
) {
  const { rows: [before] } = await pool.query<AccountCredentials>(`
    SELECT email, mat_khau_bam AS "passwordHash" FROM accounts WHERE id = $1 AND yeu_cau_xoa_luc IS NULL
  `, [owner]);
  if (!before) throw unauthorized();
  if (!await verify(before.passwordHash, input.currentPassword)) {
    throw new HttpError(403, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.');
  }
  if (input.email === before.email && input.newPassword === undefined) {
    throw new HttpError(400, 'CREDENTIALS_UNCHANGED', 'Nhập email mới hoặc mật khẩu mới.');
  }
  const changedEmail = input.email && input.email !== before.email ? input.email : null;
  const { challengeId, code } = input;
  if (changedEmail && (!challengeId || !code)) throw invalidEmailProof();
  const newHash = input.newPassword !== undefined ? await hash(input.newPassword, passwordOptions) : before.passwordHash;

  try {
    const saved = await transaction(pool, async (client) => {
      // Recheck the verified credentials under the same account lock used during login.
      const { rowCount: matches } = await client.query(`
        SELECT 1 FROM accounts
        WHERE id = $1 AND email = $2 AND mat_khau_bam = $3 AND yeu_cau_xoa_luc IS NULL
        FOR UPDATE
      `, [owner, before.email, before.passwordHash]);
      if (!matches) throw new HttpError(409, 'CREDENTIALS_CHANGED', 'Thông tin đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');

      const { rowCount: activeSession } = await client.query(`
        SELECT 1 FROM sessions
        WHERE tai_khoan_id = $1 AND token_bam = $2 AND thu_hoi_luc IS NULL
          AND het_han_luc > clock_timestamp()
        FOR UPDATE
      `, [owner, tokenHash]);
      if (!activeSession) throw unauthorized();

      if (changedEmail && !await challenges.consume(client, { purpose: 'change', subject: owner, email: changedEmail }, { challengeId: challengeId!, code: code! })) {
        return false;
      }
      await client.query('UPDATE accounts SET email = $2, mat_khau_bam = $3, email_xac_minh_luc = CASE WHEN email = $2 THEN email_xac_minh_luc ELSE clock_timestamp() END WHERE id = $1',
        [owner, input.email ?? before.email, newHash]);
      if (input.email && input.email !== before.email) {
        await client.query('DELETE FROM email_verification_codes WHERE tai_khoan_id = $1', [owner]);
      }
      await client.query('UPDATE sessions SET thu_hoi_luc = clock_timestamp() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [owner]);
      return true;
    });
    if (!saved) throw invalidEmailProof();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505'
      && 'constraint' in error && error.constraint === 'accounts_email_key') {
      throw new HttpError(409, 'EMAIL_IN_USE', 'Email này đã được sử dụng.');
    }
    throw error;
  }
}

async function replaceAvatar(pool: Pool, owner: string, replacement: PhotoReservation | null): Promise<ProfileRow> {
  return transaction(pool, async (client) => {
    const { rows: [account] } = await client.query<{ email: string }>(`
      SELECT email FROM accounts WHERE id = $1 AND yeu_cau_xoa_luc IS NULL FOR UPDATE
    `, [owner]);
    if (!account) throw unauthorized();

    const { rows: [previous] } = await client.query<{ avatarId: string | null }>(`
      SELECT anh_id AS "avatarId" FROM account_profiles WHERE tai_khoan_id = $1
    `, [owner]);
    if (!replacement && !previous) return { email: account.email, displayName: null, phone: null, avatarId: null };
    if (replacement) {
      const { rowCount } = await client.query(`
        UPDATE images SET trang_thai_luu_tru = 'ready', thu_xoa_lai_luc = NULL
        WHERE id = $1 AND tai_khoan_id = $2 AND trang_thai_luu_tru = 'pending_delete'
          AND thu_xoa_lai_luc = $3::timestamptz AND thu_xoa_lai_luc > clock_timestamp()
      `, [replacement.id, owner, replacement.expiresAt]);
      if (!rowCount) throw avatarUnavailable();
    }

    const { rows: [saved] } = await client.query<Omit<ProfileRow, 'email'>>(`
      INSERT INTO account_profiles (tai_khoan_id, anh_id) VALUES ($1, $2)
      ON CONFLICT (tai_khoan_id) DO UPDATE SET anh_id = EXCLUDED.anh_id
      RETURNING ${profileColumns}
    `, [owner, replacement?.id ?? null]);
    if (!saved) throw new Error('Profile avatar update returned no row.');

    if (previous?.avatarId) {
      await client.query(`
        UPDATE images SET trang_thai_luu_tru = 'pending_delete', thu_xoa_lai_luc = clock_timestamp()
        WHERE id = $1 AND tai_khoan_id = $2
      `, [previous.avatarId, owner]);
    }
    return { email: account.email, ...saved };
  });
}

export function createProfileRouter(
  pool: Pool, services: PhotoServices | undefined, requireSession: RequestHandler, requireCsrf: RequestHandler,
  uploadSlots: PhotoUploadSlots,
  csrfSecret: string,
) {
  const router = Router();
  const challenges = accountEmailChallenges(pool, csrfSecret);
  const credentialAttempts = new AttemptWindow(8);
  const avatarAttempts = new AttemptWindow(15);

  router.get('/profile', requireSession, async (req, res) => {
    const { rows: [profile] } = await pool.query<ProfileRow>(`
      SELECT a.email, p.ten_hien_thi AS "displayName", p.so_dien_thoai AS phone,
        p.anh_id AS "avatarId"
      FROM accounts a LEFT JOIN account_profiles p ON p.tai_khoan_id = a.id
      WHERE a.id = $1 AND a.yeu_cau_xoa_luc IS NULL
    `, [req.auth!.user.id]);
    if (!profile) throw unauthorized();
    res.json(profileResponse(profile));
  });

  router.patch('/profile', requireSession, requireCsrf, async (req, res) => {
    const input = parse(profileUpdate, req.body);
    const { rows: [profile] } = await pool.query<ProfileRow>(`
      WITH active_account AS (
        SELECT id, email FROM accounts WHERE id = $1 AND yeu_cau_xoa_luc IS NULL FOR SHARE
      ), saved AS (
        INSERT INTO account_profiles (tai_khoan_id, ten_hien_thi, so_dien_thoai)
        SELECT id, $2, $3 FROM active_account
        ON CONFLICT (tai_khoan_id) DO UPDATE SET
          ten_hien_thi = CASE WHEN $4 THEN EXCLUDED.ten_hien_thi ELSE account_profiles.ten_hien_thi END,
          so_dien_thoai = CASE WHEN $5 THEN EXCLUDED.so_dien_thoai ELSE account_profiles.so_dien_thoai END
        RETURNING ${profileColumns}
      )
      SELECT account.email, saved.* FROM active_account account CROSS JOIN saved
    `, [req.auth!.user.id, input.displayName ?? null, input.phone ?? null,
      input.displayName !== undefined, input.phone !== undefined]);
    if (!profile) throw unauthorized();
    res.json(profileResponse(profile));
  });

  router.post('/profile/credentials/email/send', requireSession, requireCsrf, async (req, res) => {
    const { email, currentPassword: password } = parse(z.strictObject({ email: accountEmail, currentPassword }), req.body);
    const user = req.auth!.user;
    if (email === user.email) throw new HttpError(400, 'CREDENTIALS_UNCHANGED', 'Hãy nhập địa chỉ email mới.');
    const cooldown = credentialAttempts.retryAfter(user.id);
    if (cooldown > 0) rejectCredentialRate(res, cooldown);
    await withPasswordWork(res, async () => {
      const { rows: [account] } = await pool.query<{ passwordHash: string }>(
        'SELECT mat_khau_bam AS "passwordHash" FROM accounts WHERE id = $1 AND email = $2 AND yeu_cau_xoa_luc IS NULL',
        [user.id, user.email],
      );
      if (!account || !await verify(account.passwordHash, password)) {
        throw new HttpError(403, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.');
      }
      const challengeId = await challenges.send({ purpose: 'change', subject: user.id, email }, req.ip ?? 'unknown', res.locals.requestId);
      res.json({ challengeId });
    });
  });

  router.patch('/profile/credentials', requireSession, requireCsrf, async (req, res) => {
    const input = parse(credentialsUpdate, req.body);
    const { user, tokenHash } = req.auth!;
    const cooldown = credentialAttempts.retryAfter(user.id);
    if (cooldown > 0) rejectCredentialRate(res, cooldown);
    await withPasswordWork(res, () => changeCredentials(pool, user.id, tokenHash, input, challenges));
    res.status(204).end();
  });

  router.put('/profile/avatar', requireSession, requireCsrf, async (req, res) => {
    if (!req.is('multipart/form-data')) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Gửi ảnh đại diện dưới dạng multipart/form-data.');
    }
    if (!services) throw avatarUnavailable();
    const owner = req.auth!.user.id;
    const cooldown = avatarAttempts.retryAfter(owner);
    if (cooldown > 0) {
      res.set('Retry-After', String(cooldown));
      throw new HttpError(429, 'AVATAR_UPLOAD_LIMIT', 'Bạn đã gửi nhiều ảnh. Vui lòng chờ rồi thử lại.');
    }
    const slot = uploadSlots.reserve(owner);
    if (slot === 'account-busy') {
      res.set('Retry-After', '5');
      throw new HttpError(429, 'AVATAR_UPLOAD_LIMIT', 'Ảnh trước đang được xử lý. Vui lòng đợi ít giây.');
    }
    if (slot === 'full') {
      res.set('Retry-After', '5');
      throw avatarUnavailable();
    }
    try {
      const original = await readAvatar(req, res);
      if (!original || Object.keys(req.body).length > 0) {
        throw new HttpError(400, 'IMAGE_REQUIRED', 'Hãy gửi một ảnh đại diện.');
      }
      const replacement = await reservePhoto(pool, services, owner, 'avatar', original).catch((error: unknown) => {
        if (error instanceof HttpError && error.status === 503) throw avatarUnavailable();
        throw error;
      });
      res.json(profileResponse(await replaceAvatar(pool, owner, replacement)));
    } finally {
      uploadSlots.release(owner);
    }
  });

  router.delete('/profile/avatar', requireSession, requireCsrf, async (req, res) => {
    await replaceAvatar(pool, req.auth!.user.id, null);
    res.status(204).end();
  });

  router.get('/profile/avatar', requireSession, async (req, res) => {
    const { version } = parse(avatarQuery, req.query);
    const owner = req.auth!.user.id;
    const { rows: [avatar] } = await pool.query<{ id: string; key: string }>(`
      SELECT i.id, i.khoa_doi_tuong AS key
      FROM account_profiles p JOIN images i ON i.id = p.anh_id AND i.tai_khoan_id = p.tai_khoan_id
      WHERE p.tai_khoan_id = $1 AND i.trang_thai_luu_tru = 'ready' AND ($2::uuid IS NULL OR i.id = $2)
    `, [owner, version ?? null]);
    if (!avatar) throw avatarMissing();
    if (!services) throw avatarUnavailable();

    const image = await services.get(avatar.key).catch((error: unknown) => {
      if (error instanceof MissingPhoto) throw avatarMissing();
      throw avatarUnavailable();
    });
    const { rowCount } = await pool.query('SELECT 1 FROM account_profiles WHERE tai_khoan_id = $1 AND anh_id = $2', [owner, avatar.id]);
    if (!rowCount) throw avatarMissing();
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(image);
  });

  return router;
}
