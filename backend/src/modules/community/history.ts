import type { RequestHandler, Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { MissingPhoto, type PhotoServices } from '../media/services.js';
import { historyPublished, publicationJoins } from './publication.js';

const uuid = z.uuid();
const cursorTime = z.iso.datetime({ precision: 6 }).refine((value) => !value.startsWith('0000-'));
const cursor = z.string().max(64).transform((value) => value.split('~')).pipe(z.tuple([cursorTime, uuid])).optional();
const pageQuery = z.strictObject({
  cursor,
  limit: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(30)).optional(),
});
const findingsSchema = z.object({ findings: z.array(z.object({
  code: z.string().max(50), label: z.string().max(160), detail: z.string().max(600),
})).max(6) });

type PageRow = { id: string; cursorTime: string };
type Note = PageRow & {
  activity: 'watering' | 'fertilizing' | 'observation';
  note: string | null;
  happenedAt: Date;
  isJournalNote: boolean;
  photoIds: string[];
};
type Diagnosis = PageRow & {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  outcome: 'healthy' | 'uncertain' | 'disease' | null;
  createdAt: Date;
  screening: unknown;
  hasPhoto: boolean;
};

const historyUnavailable = () => new HttpError(404, 'COMMUNITY_HISTORY_NOT_FOUND', 'Nhật ký và kết quả của cây này hiện chưa được chia sẻ.');
const photoNotFound = () => new HttpError(404, 'COMMUNITY_PHOTO_NOT_FOUND', 'Ảnh này hiện chưa được chia sẻ hoặc đã bị xóa.');
const readyImage = "image.trang_thai_luu_tru = 'ready'";

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Dữ liệu gửi lên không hợp lệ.');
  return result.data;
}

function page<Row extends PageRow, Item>(
  rows: (Row | { id: null })[], limit: number, project: (row: Row) => Item,
) {
  if (rows.length === 0) throw historyUnavailable();
  const entries = rows.filter((row): row is Row => row.id !== null);
  const visible = entries.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map(project),
    nextCursor: entries.length > limit && last ? `${last.cursorTime}~${last.id}` : null,
  };
}

async function readPhoto(pool: Pool, services: PhotoServices | undefined, sql: string, parameters: string[]) {
  const { rows: [image] } = await pool.query<{ key: string }>(sql, parameters);
  if (!image) throw photoNotFound();
  if (!services) throw new HttpError(503, 'PHOTO_UNAVAILABLE', 'Kho ảnh đang tạm gián đoạn.');

  let photo: Buffer;
  try {
    photo = await services.get(image.key);
  } catch (error) {
    if (error instanceof MissingPhoto) throw photoNotFound();
    throw error;
  }

  // A photo can take seconds to fetch. Check its owner, parent and publication again before responding.
  const { rows: [current] } = await pool.query<{ key: string }>(sql, parameters);
  if (current?.key !== image.key) throw photoNotFound();
  return photo;
}

export function mountCommunityHistory(
  router: Router, pool: Pool, requireSession: RequestHandler, rateLimit: RequestHandler, services?: PhotoServices,
  scope: 'plant' | 'post' = 'plant',
) {
  const base = scope === 'post' ? '/community/posts/:postId' : '/community/plants/:plantId';
  const path = scope === 'post' ? '/api/v1/community/posts' : '/api/v1/community/plants';
  const joins = scope === 'post'
    ? `${publicationJoins} JOIN community_posts social ON social.cay_nguoi_dung_id = plant.id`
    : publicationJoins;
  const target = scope === 'post' ? 'social.id = $1' : 'plant.id = $1';
  const consent = scope === 'post' ? `${historyPublished} AND social.chia_se_nhat_ky AND social.an_luc IS NULL` : historyPublished;
  const targetId = (parameters: Record<string, unknown>) => validate(uuid, parameters[scope === 'post' ? 'postId' : 'plantId']);

  router.get(`${base}/notes`, requireSession, rateLimit, async (req, res) => {
    const plantId = targetId(req.params);
    const { cursor, limit = 12 } = validate(pageQuery, req.query);
    const { rows } = await pool.query<Note | { id: null }>(`
      SELECT entries.* ${joins}
      LEFT JOIN LATERAL (
        SELECT log.id, log.hoat_dong AS activity, log.ghi_chu AS note, log.la_ghi_chu AS "isJournalNote",
          log.xay_ra_luc AS "happenedAt", to_char(log.xay_ra_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime",
          ARRAY(SELECT photo.anh_id FROM care_log_photos photo
                JOIN images image ON image.id = photo.anh_id AND image.tai_khoan_id = photo.tai_khoan_id
                WHERE photo.care_log_id = log.id AND photo.tai_khoan_id = log.tai_khoan_id AND ${readyImage}
                ORDER BY photo.position) AS "photoIds"
        FROM care_logs log
        WHERE log.cay_nguoi_dung_id = plant.id AND log.tai_khoan_id = plant.tai_khoan_id
          AND ($2::timestamptz IS NULL OR (log.xay_ra_luc, log.id) < ($2, $3::uuid))
        ORDER BY log.xay_ra_luc DESC, log.id DESC LIMIT $4
      ) entries ON true
      WHERE ${target} AND ${consent}
      ORDER BY entries."happenedAt" DESC, entries.id DESC
    `, [plantId, cursor?.[0] ?? null, cursor?.[1] ?? null, limit + 1]);
    res.json(page<Note, object>(rows, limit, ({ id, activity, note, happenedAt, isJournalNote, photoIds }) => ({
      id, activity, note, happenedAt, isJournalNote,
      photoUrls: photoIds.map((idOfPhoto) => `${path}/${plantId}/notes/${id}/photos/${idOfPhoto}`),
    })));
  });

  router.get(`${base}/diagnoses`, requireSession, rateLimit, async (req, res) => {
    const plantId = targetId(req.params);
    const { cursor, limit = 12 } = validate(pageQuery, req.query);
    const { rows } = await pool.query<Diagnosis | { id: null }>(`
      SELECT entries.* ${joins}
      LEFT JOIN LATERAL (
        SELECT scan.id, scan.trang_thai AS status, scan.ket_qua AS outcome, scan.tao_luc AS "createdAt",
          scan.ket_qua_sang_loc AS screening, to_char(scan.tao_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime",
          (${readyImage}) AS "hasPhoto"
        FROM diagnoses scan JOIN images image ON image.id = scan.anh_id AND image.tai_khoan_id = scan.tai_khoan_id
        WHERE scan.cay_nguoi_dung_id = plant.id AND scan.tai_khoan_id = plant.tai_khoan_id
          AND ($2::timestamptz IS NULL OR (scan.tao_luc, scan.id) < ($2, $3::uuid))
        ORDER BY scan.tao_luc DESC, scan.id DESC LIMIT $4
      ) entries ON true
      WHERE ${target} AND ${consent}
      ORDER BY entries."createdAt" DESC, entries.id DESC
    `, [plantId, cursor?.[0] ?? null, cursor?.[1] ?? null, limit + 1]);
    res.json(page<Diagnosis, object>(rows, limit, ({ id, status, outcome, createdAt, screening, hasPhoto }) => ({
      id, status, outcome, createdAt,
      findings: findingsSchema.safeParse(screening).data?.findings ?? [],
      photoUrl: hasPhoto ? `${path}/${plantId}/diagnoses/${id}/photo` : null,
    })));
  });

  router.get(`${base}/notes/:noteId/photos/:photoId`, requireSession, rateLimit, async (req, res) => {
    const plantId = targetId(req.params);
    const noteId = validate(uuid, req.params.noteId);
    const photoId = validate(uuid, req.params.photoId);
    const photo = await readPhoto(pool, services, `
      SELECT image.khoa_doi_tuong AS key ${joins}
      JOIN care_logs log ON log.cay_nguoi_dung_id = plant.id AND log.tai_khoan_id = plant.tai_khoan_id
      JOIN care_log_photos photo ON photo.care_log_id = log.id AND photo.tai_khoan_id = log.tai_khoan_id
      JOIN images image ON image.id = photo.anh_id AND image.tai_khoan_id = photo.tai_khoan_id
      WHERE ${target} AND log.id = $2 AND image.id = $3 AND ${consent} AND ${readyImage}
    `, [plantId, noteId, photoId]);
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(photo);
  });

  router.get(`${base}/diagnoses/:diagnosisId/photo`, requireSession, rateLimit, async (req, res) => {
    const plantId = targetId(req.params);
    const diagnosisId = validate(uuid, req.params.diagnosisId);
    const photo = await readPhoto(pool, services, `
      SELECT image.khoa_doi_tuong AS key ${joins}
      JOIN diagnoses scan ON scan.cay_nguoi_dung_id = plant.id AND scan.tai_khoan_id = plant.tai_khoan_id
      JOIN images image ON image.id = scan.anh_id AND image.tai_khoan_id = scan.tai_khoan_id
      WHERE ${target} AND scan.id = $2 AND ${consent} AND ${readyImage}
    `, [plantId, diagnosisId]);
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(photo);
  });
}
