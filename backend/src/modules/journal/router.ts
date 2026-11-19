import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow } from '../auth/throttle.js';
import { reservePhoto, type PhotoReservation } from '../media/photos.js';
import { MissingPhoto, type PhotoServices } from '../media/services.js';
import { galleryUpload, type PhotoUploadSlots } from '../media/upload.js';
import { careLogColumns, careLogPhotoIds, careLogResponse, journalTime, type CareLogRow } from './records.js';

const id = z.uuid();
const noteText = z.string().trim().max(1000).refine((value) => !value.includes('\0'));
const newNote = z.strictObject({ note: noteText.optional(), happenedAt: journalTime });
const dateChange = z.strictObject({ happenedAt: journalTime });
const readGallery = galleryUpload(4000);

const plantNotFound = () => new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
const noteNotFound = () => new HttpError(404, 'NOTE_NOT_FOUND', 'Không tìm thấy ghi chú.');
const photoNotFound = () => new HttpError(404, 'PHOTO_NOT_FOUND', 'Không tìm thấy ảnh ghi chú.');
const photoUnavailable = () => new HttpError(503, 'JOURNAL_PHOTO_UNAVAILABLE', 'Dịch vụ ảnh nhật ký đang bận hoặc tạm gián đoạn. Vui lòng thử lại.');
const imageTooLarge = () => new HttpError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt giới hạn 8 MiB hoặc độ phân giải cho phép.');

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Dữ liệu ghi chú hoặc ngày giờ không hợp lệ.');
  return result.data;
}

function mapPhotoFailure(error: unknown): never {
  if (error instanceof HttpError && error.status === 413) throw imageTooLarge();
  if (error instanceof HttpError && error.status === 422) throw error;
  if (error instanceof HttpError && error.status === 503) throw photoUnavailable();
  throw error;
}

async function insertNote(
  pool: Pool, plantId: string, owner: string, text: string | null, time: string, reservations: PhotoReservation[],
): Promise<CareLogRow> {
  const photoIds = reservations.map(({ id }) => id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const plant = await client.query(`
      SELECT p.id
      FROM user_plants p JOIN accounts a ON a.id = p.tai_khoan_id
      WHERE p.id = $1 AND p.tai_khoan_id = $2 AND a.yeu_cau_xoa_luc IS NULL
      FOR KEY SHARE OF p FOR SHARE OF a
    `, [plantId, owner]);
    if (!plant.rowCount) throw plantNotFound();

    if (photoIds.length) {
      const activated = await client.query(`
        UPDATE images AS img SET trang_thai_luu_tru = 'ready', thu_xoa_lai_luc = NULL
        FROM unnest($2::uuid[], $3::timestamptz[]) AS reserved(id, expires_at)
        WHERE img.id = reserved.id AND img.tai_khoan_id = $1
          AND img.trang_thai_luu_tru = 'pending_delete'
          AND img.thu_xoa_lai_luc = reserved.expires_at AND img.thu_xoa_lai_luc > clock_timestamp()
      `, [owner, photoIds, reservations.map(({ expiresAt }) => expiresAt)]);
      if (activated.rowCount !== photoIds.length) throw photoUnavailable();
    }

    const { rows: [note] } = await client.query<Omit<CareLogRow, 'photoIds'>>(`
      INSERT INTO care_logs (cay_nguoi_dung_id, tai_khoan_id, hoat_dong, ghi_chu, xay_ra_luc, la_ghi_chu)
      VALUES ($1, $2, 'observation', $3, $4, true)
      RETURNING ${careLogColumns}
    `, [plantId, owner, text, time]);
    if (!note) throw new Error('Journal note insert returned no row.');
    if (photoIds.length) {
      await client.query(`
        INSERT INTO care_log_photos (care_log_id, tai_khoan_id, anh_id, position)
        SELECT $1, $2, photo.id, (photo.ordinal - 1)::smallint
        FROM unnest($3::uuid[]) WITH ORDINALITY AS photo(id, ordinal)
      `, [note.id, owner, photoIds]);
    }
    await client.query('COMMIT');
    return { ...note, photoIds };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createJournalRouter(
  pool: Pool, services: PhotoServices | undefined, requireSession: RequestHandler, requireCsrf: RequestHandler,
  uploadSlots: PhotoUploadSlots,
) {
  const router = Router();
  const uploadAttempts = new AttemptWindow(15);

  router.post('/plants/:plantId/notes', requireSession, requireCsrf, async (req, res) => {
    const plantId = parse(id, req.params.plantId);
    const owner = req.auth!.user.id;
    const multipart = req.is('multipart/form-data');
    if (!multipart && !req.is('application/json')) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Gửi ghi chú dưới dạng JSON hoặc multipart/form-data.');
    }

    if (!multipart) {
      const input = parse(newNote, req.body);
      if (!input.note) throw new HttpError(400, 'NOTE_REQUIRED', 'Nhập ghi chú hoặc chọn một ảnh.');
      const note = await insertNote(pool, plantId, owner, input.note, input.happenedAt, []);
      res.status(201).json(careLogResponse(note, plantId));
      return;
    }

    const cooldown = uploadAttempts.retryAfter(owner);
    if (cooldown > 0) {
      res.set('Retry-After', String(cooldown));
      throw new HttpError(429, 'JOURNAL_UPLOAD_LIMIT', 'Bạn đã gửi nhiều ảnh. Vui lòng chờ rồi thử lại.');
    }
    const slot = uploadSlots.reserve(owner);
    if (slot === 'account-busy') {
      res.set('Retry-After', '5');
      throw new HttpError(429, 'JOURNAL_UPLOAD_LIMIT', 'Bạn đã gửi nhiều ảnh. Vui lòng chờ rồi thử lại.');
    }
    if (slot === 'full') {
      res.set('Retry-After', '5');
      throw photoUnavailable();
    }

    try {
      const { rowCount } = await pool.query('SELECT 1 FROM user_plants WHERE id = $1 AND tai_khoan_id = $2', [plantId, owner]);
      if (!rowCount) throw plantNotFound();

      const photos = await readGallery(req, res);
      const input = parse(newNote, req.body);
      if (!photos.length && !input.note) throw new HttpError(400, 'NOTE_REQUIRED', 'Nhập ghi chú hoặc chọn một ảnh.');

      const reservations: PhotoReservation[] = [];
      for (const photo of photos) {
        if (!services) throw photoUnavailable();
        const reservation = await reservePhoto(pool, services, owner, 'journal', photo).catch(mapPhotoFailure);
        reservations.push(reservation);
      }
      const note = await insertNote(pool, plantId, owner, input.note || null, input.happenedAt, reservations);
      res.status(201).json(careLogResponse(note, plantId));
    } finally {
      uploadSlots.release(owner);
    }
  });

  router.patch('/plants/:plantId/notes/:logId', requireSession, requireCsrf, async (req, res) => {
    const plantId = parse(id, req.params.plantId);
    const logId = parse(id, req.params.logId);
    const { happenedAt } = parse(dateChange, req.body);
    const { rows: [note] } = await pool.query<CareLogRow>(`
      WITH updated AS (
        UPDATE care_logs SET xay_ra_luc = $4
        WHERE id = $1 AND cay_nguoi_dung_id = $2 AND tai_khoan_id = $3 AND la_ghi_chu
        RETURNING *
      )
      SELECT ${careLogColumns}, ${careLogPhotoIds} FROM updated AS log
    `, [logId, plantId, req.auth!.user.id, happenedAt]);
    if (!note) throw noteNotFound();
    res.json(careLogResponse(note, plantId));
  });

  router.get(['/plants/:plantId/care-logs/:logId/photo', '/plants/:plantId/care-logs/:logId/photos/:photoId'], requireSession, async (req, res) => {
    const plantId = parse(id, req.params.plantId);
    const logId = parse(id, req.params.logId);
    const photoId = req.params.photoId === undefined ? null : parse(id, req.params.photoId);
    const owner = req.auth!.user.id;
    const { rows: [photo] } = await pool.query<{ key: string }>(`
      SELECT i.khoa_doi_tuong AS key FROM care_logs l
      JOIN care_log_photos photo ON photo.care_log_id = l.id AND photo.tai_khoan_id = l.tai_khoan_id
      JOIN images i ON i.id = photo.anh_id AND i.tai_khoan_id = photo.tai_khoan_id
      WHERE l.id = $1 AND l.cay_nguoi_dung_id = $2 AND l.tai_khoan_id = $3
        AND l.la_ghi_chu AND i.trang_thai_luu_tru = 'ready'
        AND (($4::uuid IS NULL AND photo.position = 0) OR i.id = $4)
    `, [logId, plantId, owner, photoId]);
    if (!photo) throw photoNotFound();
    if (!services) throw photoUnavailable();
    const data = await services.get(photo.key).catch((error: unknown) => {
      if (error instanceof MissingPhoto) throw photoNotFound();
      throw photoUnavailable();
    });
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(data);
  });

  return router;
}
