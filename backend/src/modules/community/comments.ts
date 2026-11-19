import type { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { commentMissing, lockPublishedPost, pageFields, parse, postReadable, readPost, sendPage,
  socialJoins, socialPublished, text, transact, uuid, type SocialContext } from './social-core.js';
import { readSocialInput, reserveGallery, serveCommunityPhoto, setGallery } from './social-media.js';

const inputSchema = z.strictObject({ body: text(1000).optional(), parentId: uuid.optional() });
const pageQuery = z.strictObject({ ...pageFields, parentId: uuid.optional() });
const likeInput = z.strictObject({ liked: z.boolean() });
interface CommentRow {
  id: string; postId: string; parentId: string | null; authorId: string; body: string;
  createdAt: Date; canDelete: boolean; photoIds: string[]; likeCount: number; liked: boolean;
  replyCount: number; cursor: string; moderationHidden: boolean;
}
const visibleComment = '(c.an_luc IS NULL OR c.tai_khoan_id = $1 OR p.tai_khoan_id = $1)';
const commentColumns = `
  c.id, c.post_id AS "postId", c.parent_id AS "parentId", c.tai_khoan_id AS "authorId",
  c.noi_dung AS body, c.tao_luc AS "createdAt", c.thu_tu::text AS cursor,
  (c.tai_khoan_id = $1 OR p.tai_khoan_id = $1) AS "canDelete", c.an_luc IS NOT NULL AS "moderationHidden",
  ARRAY(SELECT photo.anh_id FROM community_comment_photos photo JOIN images image ON image.id = photo.anh_id
    WHERE photo.comment_id = c.id AND image.trang_thai_luu_tru = 'ready' ORDER BY photo.position) AS "photoIds",
  (SELECT count(*)::int FROM community_comment_likes liked JOIN accounts reactor ON reactor.id = liked.tai_khoan_id
    WHERE liked.comment_id = c.id AND reactor.yeu_cau_xoa_luc IS NULL) AS "likeCount",
  EXISTS(SELECT 1 FROM community_comment_likes liked WHERE liked.comment_id = c.id AND liked.tai_khoan_id = $1) AS liked,
  (SELECT count(*)::int FROM community_post_comments reply JOIN accounts author ON author.id = reply.tai_khoan_id
    WHERE reply.parent_id = c.id AND reply.an_luc IS NULL AND author.yeu_cau_xoa_luc IS NULL) AS "replyCount"
`;
const commentJoins = `${socialJoins}
  JOIN community_post_comments c ON c.post_id = p.id
  JOIN accounts author ON author.id = c.tai_khoan_id
`;

function response(row: CommentRow, context: SocialContext) {
  const { authorId, photoIds, cursor: _cursor, ...comment } = row;
  return {
    ...comment, author: context.alias(authorId),
    photos: photoIds.map(id => ({ id, url: `/api/v1/community/posts/${row.postId}/comments/${row.id}/photos/${id}` })),
  };
}

async function readComment(db: Pool | PoolClient, postId: string, commentId: string, viewer: string) {
  const { rows: [row] } = await db.query<CommentRow>(`
    SELECT ${commentColumns} ${commentJoins}
    WHERE p.id = $2 AND c.id = $3 AND ${postReadable} AND ${visibleComment} AND author.yeu_cau_xoa_luc IS NULL
  `, [viewer, postId, commentId]);
  if (!row) throw commentMissing();
  return row;
}

export function mountComments(router: Router, context: SocialContext) {
  const { pool, requireSession, requireCsrf, readRate, writeRate } = context;
  router.get('/community/posts/:postId/comments', requireSession, readRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const { parentId, cursor, limit = 20 } = parse(pageQuery, req.query);
    const viewer = req.auth!.user.id;
    await readPost(pool, postId, viewer);
    if (parentId) await readComment(pool, postId, parentId, viewer);
    const { rows } = await pool.query<CommentRow>(`
      SELECT ${commentColumns} ${commentJoins}
      WHERE p.id = $2 AND ${postReadable} AND ${visibleComment} AND author.yeu_cau_xoa_luc IS NULL
        AND c.parent_id IS NOT DISTINCT FROM $3::uuid AND ($4::bigint IS NULL OR c.thu_tu < $4)
      ORDER BY c.thu_tu DESC LIMIT $5
    `, [viewer, postId, parentId ?? null, cursor ?? null, limit + 1]);
    sendPage(res, rows, limit, row => response(row, context));
  });

  router.post('/community/posts/:postId/comments', requireSession, requireCsrf, writeRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const viewer = req.auth!.user.id;
    await readPost(pool, postId, viewer);
    const received = await readSocialInput(req, res, context);
    try {
      const input = parse(inputSchema, received.fields);
      if (!input.body && !received.photos.length) throw new HttpError(400, 'CONTENT_REQUIRED', 'Nhập bình luận hoặc đính kèm ảnh.');
      const photos = await reserveGallery(context, viewer, received.photos);
      const row = await transact(pool, async client => {
        await lockPublishedPost(client, postId, viewer);
        if (input.parentId) {
          const parent = await readComment(client, postId, input.parentId, viewer);
          if (parent.moderationHidden) throw commentMissing();
        }
        const { rows: [created] } = await client.query<{ id: string }>(`
          INSERT INTO community_post_comments (post_id, tai_khoan_id, parent_id, noi_dung)
          VALUES ($1, $2, $3, $4) RETURNING id
        `, [postId, viewer, input.parentId ?? null, input.body ?? '']);
        if (!created) throw new Error('Comment insert returned no row.');
        await setGallery(client, 'comment', created.id, viewer, [], photos);
        return readComment(client, postId, created.id, viewer);
      });
      res.status(201).json(response(row, context));
    } finally { received.release?.(); }
  });

  router.delete('/community/posts/:postId/comments/:commentId', requireSession, requireCsrf, writeRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const commentId = parse(uuid, req.params.commentId);
    const viewer = req.auth!.user.id;
    await transact(pool, async client => {
      await lockPublishedPost(client, postId, viewer);
      const { rowCount } = await client.query(`
        DELETE FROM community_post_comments c USING community_posts p
        WHERE c.id = $1 AND c.post_id = $2 AND p.id = c.post_id
          AND (c.tai_khoan_id = $3 OR p.tai_khoan_id = $3)
      `, [commentId, postId, viewer]);
      if (!rowCount) throw commentMissing();
    });
    res.status(204).end();
  });

  router.put('/community/posts/:postId/comments/:commentId/like', requireSession, requireCsrf, writeRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const commentId = parse(uuid, req.params.commentId);
    const { liked } = parse(likeInput, req.body);
    const viewer = req.auth!.user.id;
    const result = await transact(pool, async client => {
      await lockPublishedPost(client, postId, viewer);
      const comment = await readComment(client, postId, commentId, viewer);
      if (comment.moderationHidden) throw commentMissing();
      if (liked) await client.query(`
        INSERT INTO community_comment_likes (comment_id, tai_khoan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [commentId, viewer]);
      else await client.query('DELETE FROM community_comment_likes WHERE comment_id = $1 AND tai_khoan_id = $2', [commentId, viewer]);
      const row = await readComment(client, postId, commentId, viewer);
      return { likeCount: row.likeCount, liked: row.liked };
    });
    res.json(result);
  });

  router.get('/community/posts/:postId/comments/:commentId/photos/:photoId', requireSession, readRate, async (req, res) => {
    await serveCommunityPhoto(context, res, `
      SELECT image.khoa_doi_tuong AS key ${commentJoins}
      JOIN community_comment_photos photo ON photo.comment_id = c.id AND photo.tai_khoan_id = c.tai_khoan_id
      JOIN images image ON image.id = photo.anh_id AND image.tai_khoan_id = photo.tai_khoan_id
      WHERE p.id = $2 AND c.id = $3 AND image.id = $4 AND ${postReadable} AND ${visibleComment}
        AND author.yeu_cau_xoa_luc IS NULL AND image.trang_thai_luu_tru = 'ready'
    `, [req.auth!.user.id, parse(uuid, req.params.postId), parse(uuid, req.params.commentId), parse(uuid, req.params.photoId)]);
  });
}
