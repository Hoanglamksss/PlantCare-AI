import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';

const uuid = z.uuid();
const sharedQuery = {
  search: z.string().trim().max(120).refine(value => !value.includes('\0')).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
const accountQuery = z.strictObject({ ...sharedQuery, cursor: uuid.optional() });
const postQuery = z.strictObject({
  ...sharedQuery,
  cursor: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine(value => BigInt(value) <= 9_223_372_036_854_775_807n).optional(),
});
const accountUpdate = z.strictObject({ disabled: z.boolean() });
const postUpdate = z.strictObject({ hidden: z.boolean() });

interface AdminAccount {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  disabled: boolean;
}

interface AdminPost {
  id: string;
  plantId: string;
  title: string;
  note: string;
  author: string;
  email: string;
  createdAt: Date;
  hidden: boolean;
}

const accountFields = `account.id, account.email, profile.ten_hien_thi AS "displayName",
  profile.so_dien_thoai AS phone, account.vai_tro AS role,
  (account.yeu_cau_xoa_luc IS NOT NULL) AS disabled`;
const accountFrom = 'FROM accounts account LEFT JOIN account_profiles profile ON profile.tai_khoan_id = account.id';
const postFields = `post.id, post.cay_nguoi_dung_id AS "plantId", post.tieu_de AS title,
  post.noi_dung AS note, COALESCE(profile.ten_hien_thi, 'Người trồng cây') AS author,
  account.email, post.tao_luc AS "createdAt", (post.an_luc IS NOT NULL) AS hidden`;
const postFrom = `FROM community_posts post JOIN accounts account ON account.id = post.tai_khoan_id
  LEFT JOIN account_profiles profile ON profile.tai_khoan_id = account.id`;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Dữ liệu quản trị không hợp lệ.');
  return result.data;
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw new HttpError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập.');
  if (req.auth.user.role !== 'admin') throw new HttpError(403, 'ADMIN_REQUIRED', 'Bạn cần quyền quản trị.');
  next();
};

async function adminTransaction<T>(
  pool: Pool, actor: { id: string; tokenHash: string }, action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // All account moderation and CLI grants share this lock to preserve the last active admin.
    await client.query('SELECT pg_advisory_xact_lock(87234811, 2)');
    const { rows: [account] } = await client.query<{ role: string }>(`
      SELECT account.vai_tro AS role FROM accounts account
      JOIN sessions session ON session.tai_khoan_id = account.id
      WHERE account.id = $1 AND account.yeu_cau_xoa_luc IS NULL AND session.token_bam = $2
        AND session.thu_hoi_luc IS NULL AND session.het_han_luc > clock_timestamp()
      FOR SHARE OF account, session
    `, [actor.id, actor.tokenHash]);
    if (!account) throw new HttpError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập.');
    if (account.role !== 'admin') throw new HttpError(403, 'ADMIN_REQUIRED', 'Bạn cần quyền quản trị.');
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

export function createAdminRouter(pool: Pool, requireSession: RequestHandler, requireCsrf: RequestHandler) {
  const router = Router();
  router.use('/admin', requireSession, requireAdmin);

  router.get('/admin/accounts', async (req, res) => {
    const { search, cursor, limit } = parse(accountQuery, req.query);
    const { rows } = await pool.query<AdminAccount>(`
      SELECT ${accountFields} ${accountFrom}
      WHERE ($1::uuid IS NULL OR account.id > $1)
        AND ($2 = '' OR strpos(lower(account.email), lower($2)) > 0
          OR strpos(lower(COALESCE(profile.ten_hien_thi, '')), lower($2)) > 0)
      ORDER BY account.id LIMIT $3
    `, [cursor ?? null, search, limit + 1]);
    const items = rows.slice(0, limit);
    res.json({ items, nextCursor: rows.length > limit ? items.at(-1)!.id : null });
  });

  router.patch('/admin/accounts/:accountId', requireCsrf, async (req, res) => {
    const accountId = parse(uuid, req.params.accountId);
    const { disabled } = parse(accountUpdate, req.body);
    const { user, tokenHash } = req.auth!;
    if (disabled && accountId === user.id) {
      throw new HttpError(409, 'SELF_DEACTIVATION_FORBIDDEN', 'Bạn không thể khóa chính tài khoản quản trị đang dùng.');
    }

    const updated = await adminTransaction(pool, { id: user.id, tokenHash }, async client => {
      const { rows: [target] } = await client.query<{ role: string; disabled: boolean }>(`
        SELECT vai_tro AS role, (yeu_cau_xoa_luc IS NOT NULL) AS disabled
        FROM accounts WHERE id = $1 FOR UPDATE
      `, [accountId]);
      if (!target) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
      if (disabled && !target.disabled && target.role === 'admin') {
        const { rows: [active] } = await client.query<{ count: number }>(`
          SELECT count(*)::int AS count FROM accounts WHERE vai_tro = 'admin' AND yeu_cau_xoa_luc IS NULL
        `);
        if (!active || active.count <= 1) {
          throw new HttpError(409, 'LAST_ADMIN_REQUIRED', 'Hệ thống cần ít nhất một tài khoản quản trị đang hoạt động.');
        }
      }
      if (target.disabled !== disabled) {
        await client.query(`UPDATE accounts SET yeu_cau_xoa_luc = CASE WHEN $2 THEN clock_timestamp() ELSE NULL END WHERE id = $1`,
          [accountId, disabled]);
        await client.query(`INSERT INTO admin_audit_logs (nguoi_thuc_hien_id, hanh_dong, loai_doi_tuong, doi_tuong_id)
          VALUES ($1, $2, 'account', $3)`, [user.id, disabled ? 'deactivate_account' : 'activate_account', accountId]);
      }
      if (disabled) {
        await client.query(`UPDATE sessions SET thu_hoi_luc = clock_timestamp()
          WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL`, [accountId]);
      }
      const { rows: [saved] } = await client.query<AdminAccount>(`SELECT ${accountFields} ${accountFrom} WHERE account.id = $1`, [accountId]);
      return saved!;
    });
    res.json(updated);
  });

  router.get('/admin/posts', async (req, res) => {
    const { search, cursor, limit } = parse(postQuery, req.query);
    const { rows } = await pool.query<AdminPost & { cursor: string }>(`
      SELECT ${postFields}, post.thu_tu::text AS cursor ${postFrom}
      WHERE ($1::bigint IS NULL OR post.thu_tu < $1)
        AND ($2 = '' OR strpos(lower(post.tieu_de), lower($2)) > 0
          OR strpos(lower(post.noi_dung), lower($2)) > 0 OR strpos(lower(account.email), lower($2)) > 0
          OR strpos(lower(COALESCE(profile.ten_hien_thi, '')), lower($2)) > 0)
      ORDER BY post.thu_tu DESC LIMIT $3
    `, [cursor ?? null, search, limit + 1]);
    const page = rows.slice(0, limit);
    res.json({ items: page.map(({ cursor: _cursor, ...post }) => post), nextCursor: rows.length > limit ? page.at(-1)!.cursor : null });
  });

  router.patch('/admin/posts/:postId', requireCsrf, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const { hidden } = parse(postUpdate, req.body);
    const { user, tokenHash } = req.auth!;
    const updated = await adminTransaction(pool, { id: user.id, tokenHash }, async client => {
      const { rows: [target] } = await client.query<{ hidden: boolean }>(`
        SELECT an_luc IS NOT NULL AS hidden FROM community_posts WHERE id = $1 FOR UPDATE
      `, [postId]);
      if (!target) throw new HttpError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài đăng.');
      if (target.hidden !== hidden) {
        await client.query(`UPDATE community_posts SET an_luc = CASE WHEN $2 THEN clock_timestamp() ELSE NULL END,
          cap_nhat_luc = clock_timestamp() WHERE id = $1`, [postId, hidden]);
        await client.query(`INSERT INTO admin_audit_logs (nguoi_thuc_hien_id, hanh_dong, loai_doi_tuong, doi_tuong_id)
          VALUES ($1, $2, 'post', $3)`, [user.id, hidden ? 'hide_post' : 'unhide_post', postId]);
      }
      const { rows: [saved] } = await client.query<AdminPost>(`SELECT ${postFields} ${postFrom} WHERE post.id = $1`, [postId]);
      return saved!;
    });
    res.json(updated);
  });

  return router;
}
