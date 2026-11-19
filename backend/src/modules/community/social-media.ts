import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { reservePhoto, type PhotoReservation } from '../media/photos.js';
import { MissingPhoto } from '../media/services.js';
import { galleryUpload } from '../media/upload.js';
import type { SocialContext } from './social-core.js';

const receiveGallery = galleryUpload(16_000, 7);
export const retainedPhotos = z.array(z.uuid().transform(value => value.toLowerCase())).max(4)
  .refine(value => new Set(value).size === value.length);

export async function readSocialInput(req: Request, res: Response, context: SocialContext) {
  if (req.is('application/json')) return { fields: req.body as unknown, photos: [] as Buffer[] };
  if (!req.is('multipart/form-data')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Gửi nội dung dạng JSON hoặc multipart/form-data.');
  }
  const slot = context.uploadSlots.reserve(req.auth!.user.id);
  if (slot !== 'reserved') {
    res.set('Retry-After', '5');
    throw new HttpError(slot === 'full' ? 503 : 429, 'COMMUNITY_UPLOAD_BUSY', 'Ảnh trước đang được xử lý. Vui lòng thử lại sau.');
  }
  try {
    const photos = await receiveGallery(req, res);
    const fields: Record<string, unknown> = { ...req.body };
    if ('includeHistory' in fields) {
      if (fields.includeHistory === 'true') fields.includeHistory = true;
      else if (fields.includeHistory === 'false') fields.includeHistory = false;
    }
    if (typeof fields.retainedPhotoIds === 'string') {
      try { fields.retainedPhotoIds = JSON.parse(fields.retainedPhotoIds); }
      catch { throw new HttpError(400, 'INVALID_INPUT', 'Danh sách ảnh giữ lại không hợp lệ.'); }
    }
    if (fields.parentId === '') delete fields.parentId;
    return { fields, photos, release: () => context.uploadSlots.release(req.auth!.user.id) };
  } catch (error) {
    context.uploadSlots.release(req.auth!.user.id);
    throw error;
  }
}

export async function reserveGallery(context: SocialContext, owner: string, photos: Buffer[]): Promise<PhotoReservation[]> {
  if (photos.length && !context.services) throw new HttpError(503, 'PHOTO_UNAVAILABLE', 'Dịch vụ ảnh tạm gián đoạn.');
  const reservations: PhotoReservation[] = [];
  for (const photo of photos) reservations.push(await reservePhoto(context.pool, context.services!, owner, 'community', photo));
  return reservations;
}

export async function setGallery(
  client: PoolClient, type: 'post' | 'comment', targetId: string, owner: string,
  retained: string[], reservations: PhotoReservation[],
) {
  if (retained.length + reservations.length > 4) throw new HttpError(400, 'TOO_MANY_IMAGES', 'Mỗi mục có tối đa 4 ảnh.');
  const table = type === 'post' ? 'community_post_photos' : 'community_comment_photos';
  const foreign = type === 'post' ? 'post_id' : 'comment_id';
  const { rows: existing } = await client.query<{ id: string }>(`SELECT anh_id AS id FROM ${table} WHERE ${foreign} = $1 AND tai_khoan_id = $2 ORDER BY position`, [targetId, owner]);
  const owned = new Set(existing.map(row => row.id));
  if (retained.some(id => !owned.has(id))) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Không tìm thấy ảnh của bài viết.');
  for (const reservation of reservations) {
    const { rowCount } = await client.query(`
      UPDATE images SET trang_thai_luu_tru = 'ready', thu_xoa_lai_luc = NULL
      WHERE id = $1 AND tai_khoan_id = $2 AND trang_thai_luu_tru = 'pending_delete'
        AND thu_xoa_lai_luc = $3::timestamptz AND thu_xoa_lai_luc > clock_timestamp()
    `, [reservation.id, owner, reservation.expiresAt]);
    if (!rowCount) throw new HttpError(503, 'PHOTO_UNAVAILABLE', 'Chưa thể lưu ảnh. Vui lòng thử lại.');
  }
  await client.query(`DELETE FROM ${table} WHERE ${foreign} = $1 AND tai_khoan_id = $2`, [targetId, owner]);
  const ids = [...retained, ...reservations.map(photo => photo.id)];
  if (ids.length) {
    await client.query(`UPDATE images SET trang_thai_luu_tru = 'ready', thu_xoa_lai_luc = NULL WHERE id = ANY($1::uuid[]) AND tai_khoan_id = $2`, [ids, owner]);
    await client.query(`
      INSERT INTO ${table} (${foreign}, tai_khoan_id, anh_id, position)
      SELECT $1, $2, image_id, (ordinality - 1)::smallint FROM unnest($3::uuid[]) WITH ORDINALITY AS input(image_id, ordinality)
    `, [targetId, owner, ids]);
  }
}

export async function serveCommunityPhoto(
  context: SocialContext, res: Response, query: string, values: string[],
) {
  const { rows: [before] } = await context.pool.query<{ key: string }>(query, values);
  if (!before) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Ảnh này đã bị xóa hoặc ngừng chia sẻ.');
  if (!context.services) throw new HttpError(503, 'PHOTO_UNAVAILABLE', 'Kho ảnh tạm gián đoạn.');
  const photo = await context.services.get(before.key).catch((error: unknown) => {
    if (error instanceof MissingPhoto) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Không tìm thấy ảnh.');
    throw error;
  });
  const { rows: [after] } = await context.pool.query<{ key: string }>(query, values);
  if (after?.key !== before.key) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Ảnh này đã bị xóa hoặc ngừng chia sẻ.');
  res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(photo);
}
