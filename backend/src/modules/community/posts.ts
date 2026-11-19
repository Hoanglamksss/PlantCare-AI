import type { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { journalTime } from '../journal/records.js';
import { lockPublishedPost, pageFields, parse, postColumns, postReadable, postResponse, readPost,
  sendPage, socialJoins, socialPublished, text, transact, uuid, type PostRow, type SocialContext } from './social-core.js';
import { readSocialInput, reserveGallery, retainedPhotos, serveCommunityPhoto, setGallery } from './social-media.js';

const newPost = z.strictObject({
  plantId: uuid, title: text(120).min(1), note: text(4000).optional(),
  happenedAt: journalTime, includeHistory: z.boolean().optional(),
});
const editPost = z.strictObject({
  title: text(120).min(1).optional(), note: text(4000).optional(), happenedAt: journalTime.optional(),
  includeHistory: z.boolean().optional(), retainedPhotoIds: retainedPhotos.optional(),
});
const feedQuery = z.strictObject({ ...pageFields, mine: z.enum(['true', 'false']).optional() });
const reaction = z.strictObject({ reaction: z.enum(['heart', 'cry', 'laugh']).nullable() });

export function mountPosts(router: Router, context: SocialContext) {
  const { pool, requireSession, requireCsrf, readRate, writeRate, alias } = context;
  router.get('/community/posts', requireSession, readRate, async (req, res) => {
    const { cursor, limit = 20, mine } = parse(feedQuery, req.query);
    const { rows } = await pool.query<PostRow>(`
      SELECT ${postColumns} ${socialJoins} JOIN plant_species species ON species.id = plant.loai_cay_id
      WHERE CASE WHEN $2::boolean THEN p.tai_khoan_id = $1 AND owner.yeu_cau_xoa_luc IS NULL ELSE ${socialPublished} END
        AND ($3::bigint IS NULL OR p.thu_tu < $3)
      ORDER BY p.thu_tu DESC LIMIT $4
    `, [req.auth!.user.id, mine === 'true', cursor ?? null, limit + 1]);
    sendPage(res, rows, limit, row => postResponse(row, alias));
  });

  router.get('/community/posts/:postId', requireSession, readRate, async (req, res) => {
    res.json(postResponse(await readPost(pool, parse(uuid, req.params.postId), req.auth!.user.id), alias));
  });

  router.post('/community/posts', requireSession, requireCsrf, writeRate, async (req, res) => {
    const received = await readSocialInput(req, res, context);
    try {
      const input = parse(newPost, received.fields);
      if (!input.note && !received.photos.length) throw new HttpError(400, 'CONTENT_REQUIRED', 'Nhập ghi chú hoặc đính kèm ít nhất một ảnh.');
      const owner = req.auth!.user.id;
      const { rowCount } = await pool.query('SELECT 1 FROM user_plants WHERE id = $1 AND tai_khoan_id = $2', [input.plantId, owner]);
      if (!rowCount) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
      const photos = await reserveGallery(context, owner, received.photos);
      const row = await transact(pool, async client => {
        const { rowCount: owned } = await client.query(`
          SELECT 1 FROM user_plants plant JOIN accounts account ON account.id = plant.tai_khoan_id
          WHERE plant.id = $1 AND plant.tai_khoan_id = $2 AND account.yeu_cau_xoa_luc IS NULL
          FOR UPDATE OF plant FOR SHARE OF account
        `, [input.plantId, owner]);
        if (!owned) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
        await client.query(`
          INSERT INTO community_plant_posts (cay_nguoi_dung_id, tieu_de, legacy_feed, chia_se_nhat_ky)
          VALUES ($1, left($2, 80), false, $3)
          ON CONFLICT (cay_nguoi_dung_id) DO UPDATE SET da_chia_se = true,
            chia_se_nhat_ky = community_plant_posts.chia_se_nhat_ky OR EXCLUDED.chia_se_nhat_ky
        `, [input.plantId, input.title, input.includeHistory ?? false]);
        const { rows: [created] } = await client.query<{ id: string }>(`
          INSERT INTO community_posts (cay_nguoi_dung_id, tai_khoan_id, tieu_de, noi_dung, xay_ra_luc, chia_se_nhat_ky)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, [input.plantId, owner, input.title, input.note ?? '', input.happenedAt, input.includeHistory ?? false]);
        if (!created) throw new Error('Post insert returned no row.');
        await setGallery(client, 'post', created.id, owner, [], photos);
        return readPost(client, created.id, owner);
      });
      res.status(201).location(`/api/v1/community/posts/${row.id}`).json(postResponse(row, alias));
    } finally { received.release?.(); }
  });

  router.patch('/community/posts/:postId', requireSession, requireCsrf, writeRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const owner = req.auth!.user.id;
    const existing = await readPost(pool, postId, owner);
    if (!existing.isOwner) throw new HttpError(404, 'COMMUNITY_POST_NOT_FOUND', 'Không tìm thấy bài viết.');
    const received = await readSocialInput(req, res, context);
    try {
      const input = parse(editPost, received.fields);
      if (!Object.keys(input).length && !received.photos.length) throw new HttpError(400, 'INVALID_INPUT', 'Chọn nội dung cần cập nhật.');
      const reservations = await reserveGallery(context, owner, received.photos);
      const row = await transact(pool, async client => {
        const post = await lockPublishedPost(client, postId, owner, true);
        const current = await readPost(client, postId, owner);
        const retained = input.retainedPhotoIds ?? current.photoIds;
        if (!(input.note ?? current.note) && retained.length + reservations.length === 0) {
          throw new HttpError(400, 'CONTENT_REQUIRED', 'Bài viết cần ghi chú hoặc ít nhất một ảnh.');
        }
        await setGallery(client, 'post', postId, owner, retained, reservations);
        if (input.includeHistory === true) await client.query(`
          UPDATE community_plant_posts SET chia_se_nhat_ky = true WHERE cay_nguoi_dung_id = $1
        `, [post.plantId]);
        await client.query(`
          UPDATE community_posts SET tieu_de = COALESCE($2, tieu_de), noi_dung = COALESCE($3, noi_dung),
            xay_ra_luc = COALESCE($4::timestamptz, xay_ra_luc), chia_se_nhat_ky = COALESCE($5::boolean, chia_se_nhat_ky), cap_nhat_luc = now()
          WHERE id = $1
        `, [postId, input.title ?? null, input.note ?? null, input.happenedAt ?? null, input.includeHistory ?? null]);
        return readPost(client, postId, owner);
      });
      res.json(postResponse(row, alias));
    } finally { received.release?.(); }
  });

  router.delete('/community/posts/:postId', requireSession, requireCsrf, writeRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const owner = req.auth!.user.id;
    await transact(pool, async client => {
      const post = await lockPublishedPost(client, postId, owner, true);
      if (post.legacyId) await client.query('UPDATE community_plant_posts SET legacy_feed = false WHERE cay_nguoi_dung_id = $1', [post.plantId]);
      await client.query('DELETE FROM community_posts WHERE id = $1 AND tai_khoan_id = $2', [postId, owner]);
      await client.query(`
        UPDATE community_plant_posts share SET da_chia_se = false, chia_se_nhat_ky = false
        WHERE share.cay_nguoi_dung_id = $1 AND NOT share.legacy_feed
          AND NOT EXISTS (SELECT 1 FROM community_posts p WHERE p.cay_nguoi_dung_id = $1)
      `, [post.plantId]);
    });
    res.status(204).end();
  });

  router.put('/community/posts/:postId/reaction', requireSession, requireCsrf, writeRate, async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    const input = parse(reaction, req.body);
    const viewer = req.auth!.user.id;
    const result = await transact(pool, async client => {
      await lockPublishedPost(client, postId, viewer);
      if (input.reaction) await client.query(`
        INSERT INTO community_post_reactions (post_id, tai_khoan_id, reaction) VALUES ($1, $2, $3)
        ON CONFLICT (post_id, tai_khoan_id) DO UPDATE SET reaction = EXCLUDED.reaction
      `, [postId, viewer, input.reaction]);
      else await client.query('DELETE FROM community_post_reactions WHERE post_id = $1 AND tai_khoan_id = $2', [postId, viewer]);
      const row = await readPost(client, postId, viewer);
      return { reactions: row.reactions, myReaction: row.myReaction };
    });
    res.json(result);
  });

  router.get('/community/posts/:postId/photos/:photoId', requireSession, readRate, async (req, res) => {
    await serveCommunityPhoto(context, res, `
      SELECT image.khoa_doi_tuong AS key ${socialJoins}
      JOIN community_post_photos photo ON photo.post_id = p.id AND photo.tai_khoan_id = p.tai_khoan_id
      JOIN images image ON image.id = photo.anh_id AND image.tai_khoan_id = photo.tai_khoan_id
      WHERE p.id = $2 AND image.id = $3 AND ${postReadable} AND image.trang_thai_luu_tru = 'ready'
    `, [req.auth!.user.id, parse(uuid, req.params.postId), parse(uuid, req.params.photoId)]);
  });
}
