import { createHmac } from 'node:crypto';
import { Router, type RequestHandler, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow } from '../auth/throttle.js';
import type { PhotoServices } from '../media/services.js';
import { PhotoUploadSlots } from '../media/upload.js';
import { mountPosts } from './posts.js';
import { mountComments } from './comments.js';
import { socialContext } from './social-core.js';
import { mountCommunityHistory } from './history.js';
import { publicationJoins, published } from './publication.js';

const uuid = z.uuid();
const title = z.string().trim().min(1).max(80).refine((value) => !value.includes('\0'));
const caption = z.string().trim().max(1000).refine((value) => !value.includes('\0')).nullable().optional();
const shareBody = z.discriminatedUnion('shared', [
  z.strictObject({ shared: z.literal(true), title, caption, includeHistory: z.boolean().optional() }),
  z.strictObject({ shared: z.literal(false), title: title.nullable().optional(), caption, includeHistory: z.literal(false).optional() }),
]);
const commentBody = z.strictObject({
  body: z.string().trim().min(1).max(500).refine((value) => !value.includes('\0')),
});
const cursor = z.string().regex(/^[1-9]\d{0,18}$/).refine((value) =>
  /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n);
const pagination = z.strictObject({
  cursor: cursor.optional(),
  limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(50)).optional(),
});

interface Share {
  shared: boolean;
  title: string | null;
  caption: string | null;
  includeHistory: boolean;
}

interface PostRow {
  id: string;
  title: string;
  caption: string | null;
  speciesCode: string;
  speciesName: string;
  authorId: string;
  commentCount: number;
  createdAt: Date;
  isOwner: boolean;
  archived: boolean;
  includeHistory: boolean;
  cursor: string;
}

interface CommentRow {
  id: string;
  authorId: string;
  body: string;
  createdAt: Date;
  canDelete: boolean;
  cursor: string;
}

const publicPlant = `
  SELECT plant.id, post.tieu_de AS title, post.gioi_thieu AS caption,
    species.ma AS "speciesCode", species.ten_vi AS "speciesName", plant.tai_khoan_id AS "authorId",
    post.tao_luc AS "createdAt", (plant.tai_khoan_id = $1) AS "isOwner", post.thu_tu::text AS cursor,
    (plant.luu_tru_luc IS NOT NULL) AS archived, post.chia_se_nhat_ky AS "includeHistory",
    (SELECT count(*)::int FROM community_post_comments comment
     JOIN accounts author ON author.id = comment.tai_khoan_id
     WHERE comment.post_id = plant.id AND comment.an_luc IS NULL AND author.yeu_cau_xoa_luc IS NULL) AS "commentCount"
  ${publicationJoins}
  JOIN plant_species species ON species.id = plant.loai_cay_id
`;

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Dữ liệu gửi lên không hợp lệ.');
  return result.data;
}

function getPlant<T>(row: T | undefined): T {
  if (!row) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
  return row;
}

function getPost<T>(row: T | undefined): T {
  if (!row) throw new HttpError(404, 'COMMUNITY_POST_NOT_FOUND', 'Cây này hiện chưa được chia sẻ.');
  return row;
}

function checkRate(limiter: AttemptWindow, accountId: string, res: Response) {
  const seconds = limiter.retryAfter(accountId);
  if (seconds > 0) {
    res.set('Retry-After', String(seconds));
    throw new HttpError(429, 'COMMUNITY_RATE_LIMITED', 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.');
  }
}

export function createCommunityRouter(
  pool: Pool, requireSession: RequestHandler, requireCsrf: RequestHandler, aliasSecret: string, services?: PhotoServices,
  uploadSlots = new PhotoUploadSlots(),
) {
  const router = Router();
  const readLimit = new AttemptWindow(1500);
  const publishLimit = new AttemptWindow(40);
  const commentLimit = new AttemptWindow(30);

  function alias(accountId: string) {
    const suffix = createHmac('sha256', aliasSecret).update(`community:${accountId}`).digest('hex').slice(0, 8);
    return `Người trồng ${suffix.toUpperCase()}`;
  }

  function toComment({ id, authorId, body, createdAt, canDelete }: CommentRow) {
    return { id, author: alias(authorId), body, createdAt, canDelete };
  }

  function toPublicPlant({ authorId, cursor: _cursor, ...post }: PostRow) {
    return { ...post, author: alias(authorId) };
  }

  router.get('/community/plants', requireSession, async (req, res) => {
    const userId = req.auth!.user.id;
    checkRate(readLimit, userId, res);
    const { cursor, limit = 20 } = validate(pagination, req.query);
    const { rows } = await pool.query<PostRow>(`
      ${publicPlant}
      WHERE ${published} AND ($2::bigint IS NULL OR post.thu_tu < $2)
      ORDER BY post.thu_tu DESC LIMIT $3
    `, [userId, cursor ?? null, limit + 1]);
    const page = rows.slice(0, limit);
    res.json({
      items: page.map(toPublicPlant),
      nextCursor: rows.length > limit ? page.at(-1)!.cursor : null,
    });
  });

  router.get('/community/plants/:plantId', requireSession, async (req, res) => {
    const userId = req.auth!.user.id;
    checkRate(readLimit, userId, res);
    const plantId = validate(uuid, req.params.plantId);
    const { rows } = await pool.query<PostRow>(`${publicPlant} WHERE ${published} AND plant.id = $2`, [userId, plantId]);
    res.json(toPublicPlant(getPost(rows[0])));
  });

  router.get('/plants/:plantId/share', requireSession, async (req, res) => {
    const plantId = validate(uuid, req.params.plantId);
    const { rows } = await pool.query<Share>(`
      SELECT COALESCE(post.da_chia_se, false) AS shared, post.tieu_de AS title, post.gioi_thieu AS caption,
        COALESCE(post.da_chia_se AND post.chia_se_nhat_ky, false) AS "includeHistory"
      FROM user_plants plant LEFT JOIN community_plant_posts post ON post.cay_nguoi_dung_id = plant.id
      WHERE plant.id = $1 AND plant.tai_khoan_id = $2
    `, [plantId, req.auth!.user.id]);
    res.json(getPlant(rows[0]));
  });

  router.put('/plants/:plantId/share', requireSession, requireCsrf, async (req, res) => {
    const plantId = validate(uuid, req.params.plantId);
    const userId = req.auth!.user.id;
    const input = validate(shareBody, req.body);
    const target = `SELECT id FROM user_plants WHERE id = $1 AND tai_khoan_id = $2 FOR UPDATE`;
    if (!input.shared) {
      const { rows } = await pool.query<Share>(`
        WITH target AS (${target}), hidden AS (
          UPDATE community_plant_posts SET da_chia_se = false, chia_se_nhat_ky = false FROM target
          WHERE cay_nguoi_dung_id = target.id RETURNING tieu_de AS title, gioi_thieu AS caption
        )
        SELECT false AS shared, hidden.title, hidden.caption, false AS "includeHistory"
        FROM target LEFT JOIN hidden ON true
      `, [plantId, userId]);
      res.json(getPlant(rows[0]));
      return;
    }

    checkRate(publishLimit, userId, res);
    const { rows } = await pool.query<Share>(`
      WITH target AS (${target}), saved AS (
        INSERT INTO community_plant_posts (cay_nguoi_dung_id, tieu_de, gioi_thieu, chia_se_nhat_ky)
        SELECT id, $3, $4, $5 FROM target
        ON CONFLICT (cay_nguoi_dung_id) DO UPDATE
        SET tieu_de = EXCLUDED.tieu_de, gioi_thieu = EXCLUDED.gioi_thieu,
          da_chia_se = true, chia_se_nhat_ky = EXCLUDED.chia_se_nhat_ky, legacy_feed = true
        RETURNING da_chia_se AS shared, tieu_de AS title, gioi_thieu AS caption, chia_se_nhat_ky AS "includeHistory"
      )
      SELECT * FROM saved
    `, [plantId, userId, input.title, input.caption || null, input.includeHistory ?? false]);
    res.json(getPlant(rows[0]));
  });

  router.get('/community/plants/:plantId/comments', requireSession, async (req, res) => {
    const userId = req.auth!.user.id;
    checkRate(readLimit, userId, res);
    const plantId = validate(uuid, req.params.plantId);
    const { cursor, limit = 20 } = validate(pagination, req.query);
    const { rows } = await pool.query<CommentRow | { id: null }>(`
      SELECT comments.* ${publicationJoins}
      LEFT JOIN LATERAL (
        SELECT comment.id, comment.tai_khoan_id AS "authorId", comment.noi_dung AS body,
          comment.tao_luc AS "createdAt", comment.thu_tu::text AS cursor, comment.thu_tu,
          (comment.tai_khoan_id = $2 OR plant.tai_khoan_id = $2) AS "canDelete"
        FROM community_post_comments comment JOIN accounts author ON author.id = comment.tai_khoan_id
        WHERE comment.post_id = plant.id AND comment.an_luc IS NULL AND author.yeu_cau_xoa_luc IS NULL
          AND ($3::bigint IS NULL OR comment.thu_tu < $3)
        ORDER BY comment.thu_tu DESC LIMIT $4
      ) comments ON true
      WHERE plant.id = $1 AND ${published}
      ORDER BY comments.thu_tu DESC
    `, [plantId, userId, cursor ?? null, limit + 1]);
    getPost(rows[0]);
    const items = rows.filter((row): row is CommentRow => row.id !== null);
    const page = items.slice(0, limit);
    res.json({ items: page.map(toComment), nextCursor: items.length > limit ? page.at(-1)!.cursor : null });
  });

  router.post('/community/plants/:plantId/comments', requireSession, requireCsrf, async (req, res) => {
    const userId = req.auth!.user.id;
    checkRate(commentLimit, userId, res);
    const plantId = validate(uuid, req.params.plantId);
    const { body } = validate(commentBody, req.body);
    const { rows } = await pool.query<CommentRow>(`
      WITH target AS (
        SELECT plant.id ${publicationJoins}
        WHERE plant.id = $1 AND ${published} FOR SHARE OF post
      )
      INSERT INTO community_post_comments (post_id, tai_khoan_id, noi_dung)
      SELECT id, $2, $3 FROM target
      RETURNING id, tai_khoan_id AS "authorId", noi_dung AS body, tao_luc AS "createdAt",
        true AS "canDelete", thu_tu::text AS cursor
    `, [plantId, userId, body]);
    res.status(201).json(toComment(getPost(rows[0])));
  });

  router.delete('/community/plants/:plantId/comments/:commentId', requireSession, requireCsrf, async (req, res) => {
    const plantId = validate(uuid, req.params.plantId);
    const commentId = validate(uuid, req.params.commentId);
    const { rowCount } = await pool.query(`
      WITH target AS (
        SELECT plant.id, plant.tai_khoan_id ${publicationJoins}
        WHERE plant.id = $1 AND ${published} FOR SHARE OF post
      )
      DELETE FROM community_post_comments comment USING target
      WHERE comment.id = $2 AND comment.post_id = target.id
        AND (comment.tai_khoan_id = $3 OR target.tai_khoan_id = $3)
    `, [plantId, commentId, req.auth!.user.id]);
    if (!rowCount) throw new HttpError(404, 'COMMENT_NOT_FOUND', 'Không tìm thấy bình luận.');
    res.status(204).end();
  });

  mountCommunityHistory(router, pool, requireSession, (req, res, next) => {
    checkRate(readLimit, req.auth!.user.id, res);
    next();
  }, services);

  const social = socialContext(pool, services, uploadSlots, requireSession, requireCsrf, aliasSecret);
  mountPosts(router, social);
  mountComments(router, social);
  mountCommunityHistory(router, pool, requireSession, social.readRate, services, 'post');

  return router;
}
