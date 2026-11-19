import { createHmac } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow } from '../auth/throttle.js';
import type { PhotoServices } from '../media/services.js';
import type { PhotoUploadSlots } from '../media/upload.js';

export const uuid = z.uuid().transform(value => value.toLowerCase());
export const cursor = z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n);
export const pageFields = {
  cursor: cursor.optional(),
  limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.int().min(1).max(50)).optional(),
};
export const text = (maximum: number) => z.string().trim().max(maximum).refine(value => !value.includes('\0'));
export const postMissing = () => new HttpError(404, 'COMMUNITY_POST_NOT_FOUND', 'Không tìm thấy bài viết.');
export const commentMissing = () => new HttpError(404, 'COMMUNITY_COMMENT_NOT_FOUND', 'Không tìm thấy bình luận.');

export interface SocialContext {
  pool: Pool;
  services: PhotoServices | undefined;
  uploadSlots: PhotoUploadSlots;
  requireSession: RequestHandler;
  requireCsrf: RequestHandler;
  alias: (owner: string) => string;
  readRate: RequestHandler;
  writeRate: RequestHandler;
}

export function socialContext(
  pool: Pool, services: PhotoServices | undefined, uploadSlots: PhotoUploadSlots,
  requireSession: RequestHandler, requireCsrf: RequestHandler, secret: string,
): SocialContext {
  const reads = new AttemptWindow(1500);
  const writes = new AttemptWindow(60);
  const rate = (limiter: AttemptWindow): RequestHandler => (req, res, next) => {
    const wait = limiter.retryAfter(req.auth!.user.id);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      throw new HttpError(429, 'COMMUNITY_RATE_LIMITED', 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.');
    }
    next();
  };
  return {
    pool, services, uploadSlots, requireSession, requireCsrf,
    alias: owner => `Người trồng ${createHmac('sha256', secret).update(`community:${owner}`).digest('hex').slice(0, 8).toUpperCase()}`,
    readRate: rate(reads), writeRate: rate(writes),
  };
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Nội dung, ngày giờ hoặc ảnh được chọn không hợp lệ.');
  return result.data;
}

export async function transact<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
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

export const socialJoins = `
  FROM community_posts p
  JOIN user_plants plant ON plant.id = p.cay_nguoi_dung_id AND plant.tai_khoan_id = p.tai_khoan_id
  JOIN accounts owner ON owner.id = p.tai_khoan_id
  JOIN community_plant_posts share ON share.cay_nguoi_dung_id = plant.id
`;
export const socialPublished = 'share.da_chia_se AND p.an_luc IS NULL AND owner.yeu_cau_xoa_luc IS NULL';
export const postReadable = `owner.yeu_cau_xoa_luc IS NULL AND ((${socialPublished}) OR p.tai_khoan_id = $1)`;

export interface PostRow {
  id: string;
  plantId: string;
  title: string;
  note: string;
  happenedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  isOwner: boolean;
  includeHistory: boolean;
  isPublished: boolean;
  moderationHidden: boolean;
  speciesCode: string;
  speciesName: string;
  archived: boolean;
  photoIds: string[];
  reactions: { heart: number; cry: number; laugh: number };
  myReaction: 'heart' | 'cry' | 'laugh' | null;
  commentCount: number;
  cursor: string;
}

export const postColumns = `
  p.id, p.cay_nguoi_dung_id AS "plantId", p.tieu_de AS title, p.noi_dung AS note,
  p.xay_ra_luc AS "happenedAt", p.tao_luc AS "createdAt", p.cap_nhat_luc AS "updatedAt",
  p.tai_khoan_id AS "authorId", p.tai_khoan_id = $1 AS "isOwner", p.thu_tu::text AS cursor,
  (p.chia_se_nhat_ky AND share.da_chia_se AND share.chia_se_nhat_ky AND p.an_luc IS NULL) AS "includeHistory",
  (${socialPublished}) AS "isPublished", p.an_luc IS NOT NULL AS "moderationHidden",
  species.ma AS "speciesCode", species.ten_vi AS "speciesName", plant.luu_tru_luc IS NOT NULL AS archived,
  ARRAY(SELECT photo.anh_id FROM community_post_photos photo JOIN images i ON i.id = photo.anh_id
    WHERE photo.post_id = p.id AND i.trang_thai_luu_tru = 'ready' ORDER BY photo.position) AS "photoIds",
  (SELECT jsonb_build_object('heart', count(*) FILTER (WHERE reaction = 'heart'),
    'cry', count(*) FILTER (WHERE reaction = 'cry'), 'laugh', count(*) FILTER (WHERE reaction = 'laugh'))
    FROM community_post_reactions reaction JOIN accounts reactor ON reactor.id = reaction.tai_khoan_id
    WHERE reaction.post_id = p.id AND reactor.yeu_cau_xoa_luc IS NULL) AS reactions,
  (SELECT reaction FROM community_post_reactions WHERE post_id = p.id AND tai_khoan_id = $1) AS "myReaction",
  (SELECT count(*)::int FROM community_post_comments comment JOIN accounts author ON author.id = comment.tai_khoan_id
    WHERE comment.post_id = p.id AND comment.an_luc IS NULL AND author.yeu_cau_xoa_luc IS NULL) AS "commentCount"
`;

export function postResponse(row: PostRow, alias: SocialContext['alias']) {
  const { photoIds, authorId, speciesCode, speciesName, archived, cursor: _cursor, ...post } = row;
  return {
    ...post, author: alias(authorId), plant: { speciesCode, speciesName, archived },
    photos: photoIds.map(id => ({ id, url: `/api/v1/community/posts/${post.id}/photos/${id}` })),
  };
}

export async function readPost(pool: Pool | PoolClient, postId: string, viewer: string) {
  const { rows: [row] } = await pool.query<PostRow>(`
    SELECT ${postColumns} ${socialJoins} JOIN plant_species species ON species.id = plant.loai_cay_id
    WHERE p.id = $2 AND ${postReadable}
  `, [viewer, postId]);
  if (!row) throw postMissing();
  return row;
}

export async function lockPublishedPost(client: PoolClient, postId: string, viewer: string, ownerOnly = false) {
  const { rows: [pointer] } = await client.query<{ plantId: string }>(
    'SELECT cay_nguoi_dung_id AS "plantId" FROM community_posts WHERE id = $1', [postId],
  );
  if (!pointer) throw postMissing();
  // Share controls lock the plant first. Use the same order before locking a post.
  await client.query('SELECT 1 FROM user_plants WHERE id = $1 FOR UPDATE', [pointer.plantId]);
  const { rows: [row] } = await client.query<{ plantId: string; authorId: string; legacyId: string | null }>(`
    SELECT p.cay_nguoi_dung_id AS "plantId", p.tai_khoan_id AS "authorId", p.legacy_plant_id AS "legacyId"
    ${socialJoins}
    WHERE p.id = $2 AND $1::uuid IS NOT NULL
      AND ${ownerOnly ? 'p.tai_khoan_id = $1 AND owner.yeu_cau_xoa_luc IS NULL' : socialPublished}
    FOR UPDATE OF p FOR SHARE OF share
  `, [viewer, postId]);
  if (!row) throw postMissing();
  return row;
}

export function sendPage<T extends { cursor: string }>(res: Response, rows: T[], limit: number, project: (row: T) => unknown) {
  const items = rows.slice(0, limit);
  res.json({ items: items.map(project), nextCursor: rows.length > limit ? items.at(-1)!.cursor : null });
}
