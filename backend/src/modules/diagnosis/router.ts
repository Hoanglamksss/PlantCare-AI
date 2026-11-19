import { createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow } from '../auth/throttle.js';
import { reservePhoto } from '../media/photos.js';
import { MissingPhoto, type Analysis, type PhotoServices } from '../media/services.js';
import { photoUpload, type PhotoUploadSlots } from '../media/upload.js';
import { isScreeningSpecies, screeningGuidance } from './guidance.js';
import { checkCapacity, lockQueue, startDiagnosisWorker } from './queue.js';
const idSchema = z.uuid().transform((value) => value.toLowerCase());
const inputSchema = z.strictObject({
  speciesCode: z.string().min(1).max(64),
  plantId: idSchema.optional(),
});
const listSchema = z.strictObject({
  plantId: idSchema.optional(),
  cursor: idSchema.optional(),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.int().min(1).max(30)).optional(),
});
const idempotencySchema = z.string().min(8).max(128).regex(/^[a-zA-Z0-9._-]+$/);
const readPhoto = photoUpload(128);

type Input = z.infer<typeof inputSchema>;
type Status = 'queued' | 'processing' | 'completed' | 'failed';
interface DiagnosisRow {
  id: string;
  status: Status;
  speciesCode: string;
  plantId: string | null;
  createdAt: Date;
  outcome: 'disease' | 'healthy' | 'uncertain' | null;
  modelVersion: string | null;
  failureCode: string | null;
  readyPhoto: boolean;
  screening: Pick<Analysis, 'findings'> | null;
}

const notFound = () => new HttpError(404, 'DIAGNOSIS_NOT_FOUND', 'Không tìm thấy lần sàng lọc này.');
const notAvailable = () => new HttpError(503, 'SCREENING_UNAVAILABLE', 'Dịch vụ sàng lọc ảnh chưa sẵn sàng.');

const diagnosisColumns = `
  d.id, d.trang_thai AS status, s.ma AS "speciesCode", d.cay_nguoi_dung_id AS "plantId",
  d.tao_luc AS "createdAt", d.ket_qua AS outcome, d.phien_ban_mo_hinh AS "modelVersion",
  d.ma_loi AS "failureCode", i.trang_thai_luu_tru = 'ready' AS "readyPhoto",
  d.ket_qua_sang_loc AS screening
`;
const diagnosisJoins = `
  FROM diagnoses d JOIN plant_species s ON s.id = d.loai_cay_chon_id
  JOIN images i ON i.id = d.anh_id AND i.tai_khoan_id = d.tai_khoan_id
`;

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Dữ liệu gửi lên không hợp lệ.');
  return result.data;
}

function responseData(row: DiagnosisRow) {
  const { id, status, speciesCode, plantId, createdAt, outcome, modelVersion, failureCode, readyPhoto, screening } = row;
  return {
    id, status, speciesCode, plantId, createdAt,
    ...(outcome && { outcome }),
    ...(modelVersion && { modelVersion }),
    ...(screening && {
      findings: screening.findings,
      ...screeningGuidance(speciesCode, outcome, screening.findings),
    }),
    ...(status === 'failed' && { retryable: readyPhoto && failureCode === 'SCREENING_UNAVAILABLE' }),
  };
}

function digest(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

async function existingSubmission(client: PoolClient, owner: string, key: string, fingerprint: string) {
  const { rows: [existing] } = await client.query<{ id: string; status: Status; requestHash: string }>(`
    SELECT id, trang_thai AS status, request_bam AS "requestHash"
    FROM diagnoses WHERE tai_khoan_id = $1 AND khoa_idempotency_bam = $2
  `, [owner, key]);
  if (existing) {
    if (existing.requestHash !== fingerprint) {
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Mã yêu cầu này đã được dùng cho ảnh khác.');
    }
    return { id: existing.id, status: existing.status };
  }
  const { rowCount } = await client.query(`
    SELECT 1 FROM deleted_diagnosis_keys
    WHERE tai_khoan_id = $1 AND khoa_idempotency_bam = $2 AND het_han_luc > now()
  `, [owner, key]);
  if (rowCount) throw new HttpError(410, 'DIAGNOSIS_DELETED', 'Lần sàng lọc này đã được xóa.');
  return undefined;
}

async function validatePlant(client: PoolClient, owner: string, input: Input) {
  if (!isScreeningSpecies(input.speciesCode)) {
    throw new HttpError(422, 'SPECIES_UNAVAILABLE', 'Loại cây này chưa được hỗ trợ.');
  }
  const { rows: [species] } = await client.query<{ id: string }>(`
    SELECT id FROM plant_species WHERE ma = $1 AND dang_hoat_dong
  `, [input.speciesCode]);
  if (!species) throw new HttpError(422, 'SPECIES_UNAVAILABLE', 'Loại cây này chưa được hỗ trợ.');
  if (input.plantId) {
    const { rows: [plant] } = await client.query<{ speciesId: string }>(`
      SELECT loai_cay_id AS "speciesId" FROM user_plants WHERE id = $1 AND tai_khoan_id = $2
    `, [input.plantId, owner]);
    if (!plant) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
    if (plant.speciesId !== species.id) {
      throw new HttpError(422, 'SPECIES_MISMATCH', 'Loài đã chọn khác với loài của hồ sơ cây.');
    }
  }
  return species.id;
}

async function submitPhoto(
  pool: Pool, services: PhotoServices, owner: string, input: Input, original: Buffer, headerKey: string,
) {
  const key = digest(headerKey);
  const fingerprint = digest(JSON.stringify([input.speciesCode, input.plantId ?? null, digest(original)]));
  const first = await lockQueue(pool, async (client) => {
    const replay = await existingSubmission(client, owner, key, fingerprint);
    if (replay) return replay;
    await validatePlant(client, owner, input);
    await checkCapacity(client, owner);
    return undefined;
  });
  if (first) return { replay: true, ...first };

  const reservation = await reservePhoto(pool, services, owner, 'screening', original);

  return lockQueue(pool, async (client) => {
    const replay = await existingSubmission(client, owner, key, fingerprint);
    if (replay) return { replay: true, ...replay };
    const speciesId = await validatePlant(client, owner, input);
    await checkCapacity(client, owner);
    const { rowCount } = await client.query(`
      UPDATE images SET trang_thai_luu_tru = 'ready', thu_xoa_lai_luc = NULL
      WHERE id = $1 AND tai_khoan_id = $2 AND trang_thai_luu_tru = 'pending_delete'
        AND thu_xoa_lai_luc = $3::timestamptz AND thu_xoa_lai_luc > clock_timestamp()
    `, [reservation.id, owner, reservation.expiresAt]);
    if (!rowCount) throw notAvailable();
    const { rows: [diagnosis] } = await client.query<{ id: string; status: Status }>(`
      INSERT INTO diagnoses (tai_khoan_id, loai_cay_chon_id, cay_nguoi_dung_id, anh_id,
        khoa_idempotency_bam, request_bam)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, trang_thai AS status
    `, [owner, speciesId, input.plantId ?? null, reservation.id, key, fingerprint]);
    if (!diagnosis) throw notAvailable();
    await client.query('INSERT INTO diagnosis_jobs (chan_doan_id) VALUES ($1)', [diagnosis.id]);
    return { replay: false, ...diagnosis };
  });
}

export function createDiagnosisRouter(
  pool: Pool,
  requireSession: RequestHandler,
  requireCsrf: RequestHandler,
  services: PhotoServices | undefined,
  uploadSlots: PhotoUploadSlots,
) {
  const router = Router();
  if (services) startDiagnosisWorker(pool, services);
  const uploadAttempts = new AttemptWindow(15);

  router.get('/diagnoses', requireSession, async (req, res) => {
    const { cursor, plantId, limit = 12 } = parse(listSchema, req.query);
    const owner = req.auth!.user.id;
    const { rows } = await pool.query<DiagnosisRow>(`
      SELECT ${diagnosisColumns}
      ${diagnosisJoins}
      WHERE d.tai_khoan_id = $1 AND ($2::uuid IS NULL OR d.cay_nguoi_dung_id = $2)
        AND ($3::uuid IS NULL OR (d.tao_luc, d.id) < (
          SELECT anchor.tao_luc, anchor.id FROM diagnoses anchor
          WHERE anchor.id = $3 AND anchor.tai_khoan_id = $1
            AND ($2::uuid IS NULL OR anchor.cay_nguoi_dung_id = $2)
        ))
      ORDER BY d.tao_luc DESC, d.id DESC LIMIT $4
    `, [owner, plantId ?? null, cursor ?? null, limit + 1]);
    const items = rows.slice(0, limit).map(responseData);
    res.json({ items, nextCursor: rows.length > limit ? items.at(-1)!.id : null });
  });

  router.post('/diagnoses', requireSession, requireCsrf, async (req, res) => {
    if (!services) throw notAvailable();
    if (!req.is('multipart/form-data')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Gửi ảnh qua multipart/form-data.');
    const owner = req.auth!.user.id;
    const key = parse(idempotencySchema, req.get('Idempotency-Key'));
    const cooldown = uploadAttempts.retryAfter(owner);
    if (cooldown > 0) {
      res.set('Retry-After', String(cooldown));
      throw new HttpError(429, 'SCREENING_LIMIT', 'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau.');
    }
    const slot = uploadSlots.reserve(owner);
    if (slot === 'account-busy') {
      res.set('Retry-After', '5');
      throw new HttpError(429, 'SCREENING_LIMIT', 'Ảnh trước đang được tải lên. Vui lòng đợi trong ít giây.');
    }
    if (slot === 'full') {
      res.set('Retry-After', '5');
      throw notAvailable();
    }
    try {
      const original = await readPhoto(req, res);
      if (!original) throw new HttpError(400, 'IMAGE_REQUIRED', 'Hãy chụp hoặc chọn một ảnh.');
      const input = parse(inputSchema, req.body);
      const { replay, ...result } = await submitPhoto(pool, services, owner, input, original, key);
      res.status(replay ? 200 : 202).location(`/api/v1/diagnoses/${result.id}`).json(result);
    } catch (error) {
      if (error instanceof HttpError && [429, 503].includes(error.status)) res.set('Retry-After', '10');
      throw error;
    } finally {
      uploadSlots.release(owner);
    }
  });

  router.get('/diagnoses/:diagnosisId', requireSession, async (req, res) => {
    const id = parse(idSchema, req.params.diagnosisId);
    const { rows: [row] } = await pool.query<DiagnosisRow>(`
      SELECT ${diagnosisColumns} ${diagnosisJoins}
      WHERE d.id = $1 AND d.tai_khoan_id = $2
    `, [id, req.auth!.user.id]);
    if (!row) throw notFound();
    res.json(responseData(row));
  });

  router.get('/diagnoses/:diagnosisId/photo', requireSession, async (req, res) => {
    const id = parse(idSchema, req.params.diagnosisId);
    const owner = req.auth!.user.id;
    const { rows: [image] } = await pool.query<{ key: string }>(`
      SELECT i.khoa_doi_tuong AS key ${diagnosisJoins}
      WHERE d.id = $1 AND d.tai_khoan_id = $2 AND i.trang_thai_luu_tru = 'ready'
    `, [id, owner]);
    if (!image) throw notFound();
    if (!services) throw notAvailable();
    let data: Buffer;
    try {
      data = await services.get(image.key);
    } catch (error) {
      if (error instanceof MissingPhoto) throw notFound();
      throw error;
    }
    const { rowCount } = await pool.query('SELECT 1 FROM diagnoses WHERE id = $1 AND tai_khoan_id = $2', [id, owner]);
    if (!rowCount) throw notFound();
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(data);
  });

  router.post('/diagnoses/:diagnosisId/retry', requireSession, requireCsrf, async (req, res) => {
    if (!services) throw notAvailable();
    const id = parse(idSchema, req.params.diagnosisId);
    const owner = req.auth!.user.id;
    try {
      await lockQueue(pool, async (client) => {
        const { rows: [row] } = await client.query<{ status: Status; failureCode: string; ready: boolean }>(`
          SELECT d.trang_thai AS status, d.ma_loi AS "failureCode", i.trang_thai_luu_tru = 'ready' AS ready
          FROM diagnoses d JOIN images i ON i.id = d.anh_id JOIN diagnosis_jobs j ON j.chan_doan_id = d.id
          WHERE d.id = $1 AND d.tai_khoan_id = $2
        `, [id, owner]);
        if (!row) throw notFound();
        if (row.status !== 'failed' || row.failureCode !== 'SCREENING_UNAVAILABLE' || !row.ready) {
          throw new HttpError(409, 'CANNOT_RETRY', 'Lần sàng lọc này chưa thể thử lại.');
        }
        await checkCapacity(client, owner);
        await client.query(`
          UPDATE diagnosis_jobs SET token_nhan = NULL, het_han_thue_luc = NULL, so_lan_thu = 0, kha_dung_luc = now()
          WHERE chan_doan_id = $1
        `, [id]);
        await client.query(`
          UPDATE diagnoses SET trang_thai = 'queued', ma_loi = NULL, hoan_tat_luc = NULL WHERE id = $1
        `, [id]);
      });
    } catch (error) {
      if (error instanceof HttpError && [429, 503].includes(error.status)) res.set('Retry-After', '10');
      throw error;
    }
    res.status(202).location(`/api/v1/diagnoses/${id}`).json({ id, status: 'queued' });
  });

  router.delete('/diagnoses/:diagnosisId', requireSession, requireCsrf, async (req, res) => {
    const id = parse(idSchema, req.params.diagnosisId);
    const owner = req.auth!.user.id;
    await lockQueue(pool, async (client) => {
      const { rows: [row] } = await client.query<{ imageId: string; key: string }>(`
        DELETE FROM diagnoses WHERE id = $1 AND tai_khoan_id = $2
        RETURNING anh_id AS "imageId", khoa_idempotency_bam AS key
      `, [id, owner]);
      if (!row) throw notFound();
      await client.query(`
        INSERT INTO deleted_diagnosis_keys (tai_khoan_id, khoa_idempotency_bam, het_han_luc)
        VALUES ($1, $2, now() + interval '24 hours')
        ON CONFLICT (tai_khoan_id, khoa_idempotency_bam) DO UPDATE SET het_han_luc = EXCLUDED.het_han_luc
      `, [owner, row.key]);
      await client.query(`
        UPDATE images SET trang_thai_luu_tru = 'pending_delete', thu_xoa_lai_luc = now() WHERE id = $1
      `, [row.imageId]);
    });
    res.status(204).end();
  });

  return router;
}
