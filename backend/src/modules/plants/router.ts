import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { careActivities, careLogColumns, careLogPhotoIds, careLogResponse, journalTime, type CareLogRow } from '../journal/records.js';

const id = z.uuid();
const nickname = z.string().trim().min(1).max(80).refine((value) => !value.includes('\0'));
const note = z.string().trim().max(1000).refine((value) => !value.includes('\0')).nullable();
const plantedOn = z.iso.date().refine((value) => !value.startsWith('0000-')).nullable();
const speciesCode = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const pagination = {
  cursor: id.optional(),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
};

const listPlants = z.strictObject({ ...pagination, archived: z.enum(['true', 'false']).optional() });
const listCareLogs = z.strictObject(pagination);
const createPlant = z.strictObject({ speciesCode, nickname, note: note.optional(), plantedOn: plantedOn.optional() });
const updatePlant = z.strictObject({
  nickname: nickname.optional(),
  note: note.optional(),
  plantedOn: plantedOn.optional(),
  archived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);
const createCareLog = z.strictObject({
  activity: z.enum(careActivities),
  note: note.optional(),
  happenedAt: journalTime,
});

interface Plant {
  id: string;
  speciesCode: string;
  speciesName: string;
  nickname: string;
  note: string | null;
  plantedOn: string | null;
  archivedAt: Date | null;
}

const plantColumns = `p.id, s.ma AS "speciesCode", s.ten_vi AS "speciesName",
  p.biet_danh AS nickname, p.ghi_chu AS note, p.ngay_trong::text AS "plantedOn",
  p.luu_tru_luc AS "archivedAt"`;

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'INVALID_INPUT', 'Dữ liệu gửi lên không hợp lệ.');
  }
  return result.data;
}

function requirePlant<T>(row: T | undefined): T {
  if (!row) {
    throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
  }
  return row;
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
}

export function createPlantRouter(pool: Pool, requireSession: RequestHandler, requireCsrf: RequestHandler) {
  const router = Router();

  router.get('/catalog/species', requireSession, async (_req, res) => {
    const { rows } = await pool.query<{ code: string; name: string }>(
      'SELECT ma AS code, ten_vi AS name FROM plant_species WHERE dang_hoat_dong ORDER BY ma',
    );
    res.json({ items: rows });
  });

  router.get('/plants', requireSession, async (req, res) => {
    const { archived, cursor, limit = 20 } = validate(listPlants, req.query);
    const { rows } = await pool.query<Plant>(`
      SELECT ${plantColumns}
      FROM user_plants p JOIN plant_species s ON s.id = p.loai_cay_id
      WHERE p.tai_khoan_id = $1 AND (p.luu_tru_luc IS NOT NULL) = $2
        AND ($3::uuid IS NULL OR p.id < $3)
      ORDER BY p.id DESC LIMIT $4
    `, [req.auth!.user.id, archived === 'true', cursor ?? null, limit + 1]);
    res.json(page(rows, limit));
  });

  router.post('/plants', requireSession, requireCsrf, async (req, res) => {
    const input = validate(createPlant, req.body);
    const { rows } = await pool.query<Plant>(`
      WITH inserted AS (
        INSERT INTO user_plants (tai_khoan_id, loai_cay_id, biet_danh, ghi_chu, ngay_trong)
        SELECT $1, id, $3, $4, $5 FROM plant_species WHERE ma = $2 AND dang_hoat_dong
        RETURNING *
      )
      SELECT ${plantColumns} FROM inserted p JOIN plant_species s ON s.id = p.loai_cay_id
    `, [req.auth!.user.id, input.speciesCode, input.nickname, input.note ?? null, input.plantedOn ?? null]);
    const plant = rows[0];
    if (!plant) {
      throw new HttpError(422, 'SPECIES_UNAVAILABLE', 'Loài cây này hiện chưa được hỗ trợ.');
    }
    res.location(`/api/v1/plants/${plant.id}`).status(201).json(plant);
  });

  router.get('/plants/:plantId', requireSession, async (req, res) => {
    const plantId = validate(id, req.params.plantId);
    const { rows } = await pool.query<Plant>(`
      SELECT ${plantColumns}
      FROM user_plants p JOIN plant_species s ON s.id = p.loai_cay_id
      WHERE p.id = $1 AND p.tai_khoan_id = $2
    `, [plantId, req.auth!.user.id]);
    res.json(requirePlant(rows[0]));
  });

  router.patch('/plants/:plantId', requireSession, requireCsrf, async (req, res) => {
    const plantId = validate(id, req.params.plantId);
    const input = validate(updatePlant, req.body);
    const { rows } = await pool.query<Plant>(`
      WITH updated AS (
        UPDATE user_plants
        SET biet_danh = COALESCE($3::text, biet_danh),
            ghi_chu = CASE WHEN $4 THEN $5::text ELSE ghi_chu END,
            ngay_trong = CASE WHEN $6 THEN $7::date ELSE ngay_trong END,
            luu_tru_luc = CASE
              WHEN $8::boolean THEN COALESCE(luu_tru_luc, now())
              WHEN NOT $8 THEN NULL
              ELSE luu_tru_luc
            END
        WHERE id = $1 AND tai_khoan_id = $2
        RETURNING *
      )
      SELECT ${plantColumns} FROM updated p JOIN plant_species s ON s.id = p.loai_cay_id
    `, [
      plantId, req.auth!.user.id, input.nickname ?? null,
      input.note !== undefined, input.note ?? null,
      input.plantedOn !== undefined, input.plantedOn ?? null, input.archived ?? null,
    ]);
    res.json(requirePlant(rows[0]));
  });

  router.get('/plants/:plantId/care-logs', requireSession, async (req, res) => {
    const plantId = validate(id, req.params.plantId);
    const { cursor, limit = 20 } = validate(listCareLogs, req.query);
    const { rows } = await pool.query<CareLogRow | { id: null }>(`
      SELECT logs.*
      FROM user_plants p
      LEFT JOIN LATERAL (
        SELECT ${careLogColumns}, ${careLogPhotoIds}
        FROM care_logs AS log
        WHERE cay_nguoi_dung_id = p.id AND (
          $3::uuid IS NULL OR (xay_ra_luc, id) < (
            SELECT xay_ra_luc, id FROM care_logs WHERE id = $3 AND cay_nguoi_dung_id = p.id
          )
        )
        ORDER BY xay_ra_luc DESC, id DESC LIMIT $4
      ) logs ON true
      WHERE p.id = $1 AND p.tai_khoan_id = $2
      ORDER BY logs."happenedAt" DESC, logs.id DESC
    `, [plantId, req.auth!.user.id, cursor ?? null, limit + 1]);
    requirePlant(rows[0]);
    res.json(page(rows.filter((row): row is CareLogRow => row.id !== null).map((log) => careLogResponse(log, plantId)), limit));
  });

  router.post('/plants/:plantId/care-logs', requireSession, requireCsrf, async (req, res) => {
    const plantId = validate(id, req.params.plantId);
    const input = validate(createCareLog, req.body);
    const { rows } = await pool.query<CareLogRow | { id: null }>(`
      WITH plant AS (
        SELECT id, tai_khoan_id, luu_tru_luc FROM user_plants WHERE id = $1 AND tai_khoan_id = $2 FOR UPDATE
      ), inserted AS (
        INSERT INTO care_logs (cay_nguoi_dung_id, tai_khoan_id, hoat_dong, ghi_chu, xay_ra_luc)
        SELECT id, tai_khoan_id, $3, $4, $5 FROM plant WHERE luu_tru_luc IS NULL
        RETURNING ${careLogColumns}, ARRAY[]::uuid[] AS "photoIds"
      )
      SELECT inserted.* FROM plant LEFT JOIN inserted ON true
    `, [plantId, req.auth!.user.id, input.activity, input.note ?? null, input.happenedAt]);
    const entry = requirePlant(rows[0]);
    if (entry.id === null) {
      throw new HttpError(409, 'PLANT_ARCHIVED', 'Khôi phục cây để ghi thêm nhật ký.');
    }
    res.status(201).json(careLogResponse(entry, plantId));
  });

  return router;
}
