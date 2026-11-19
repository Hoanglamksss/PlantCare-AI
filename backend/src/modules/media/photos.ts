import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../../errors.js';
import type { PhotoServices } from './services.js';

export interface PhotoReservation {
  id: string;
  expiresAt: string;
}

export async function reservePhoto(
  pool: Pool, services: PhotoServices, owner: string, scope: 'screening' | 'journal' | 'avatar' | 'community', original: Buffer,
): Promise<PhotoReservation> {
  const photo = await services.prepare(original);
  const objectKey = `private-${scope}/${randomUUID()}.jpg`;
  // Track the object before PUT so an interrupted upload can be cleaned up.
  const { rows: [reservation] } = await pool.query<PhotoReservation>(`
    INSERT INTO images (tai_khoan_id, khoa_doi_tuong, loai_mime, kich_thuoc_byte,
      trang_thai_luu_tru, thu_xoa_lai_luc)
    VALUES ($1, $2, 'image/jpeg', $3, 'pending_delete', clock_timestamp() + interval '2 minutes')
    RETURNING id, thu_xoa_lai_luc::text AS "expiresAt"
  `, [owner, objectKey, photo.length]);
  if (!reservation) throw new HttpError(503, 'SCREENING_UNAVAILABLE', 'Chưa thể lưu ảnh. Vui lòng thử lại.');
  await services.put(objectKey, photo);
  return reservation;
}

export async function cleanPendingPhoto(pool: Pool, services: PhotoServices) {
  const { rows: [photo] } = await pool.query<{ id: string; key: string }>(`
    WITH candidate AS (
      SELECT i.id FROM images i
      WHERE i.trang_thai_luu_tru = 'pending_delete' AND i.thu_xoa_lai_luc <= now()
        AND NOT EXISTS (SELECT 1 FROM diagnoses d WHERE d.anh_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM care_log_photos l WHERE l.anh_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM account_profiles p WHERE p.anh_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM community_post_photos p WHERE p.anh_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM community_comment_photos p WHERE p.anh_id = i.id)
      ORDER BY i.thu_xoa_lai_luc LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE images i SET thu_xoa_lai_luc = now() + interval '5 minutes'
    FROM candidate c WHERE i.id = c.id
    RETURNING i.id, i.khoa_doi_tuong AS key
  `);
  if (!photo) return;
  await services.remove(photo.key);
  await pool.query("DELETE FROM images WHERE id = $1 AND trang_thai_luu_tru = 'pending_delete'", [photo.id]);
}
