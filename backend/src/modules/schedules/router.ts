import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { AttemptWindow } from '../auth/throttle.js';
import { initialOccurrence, validLocalDate } from './recurrence.js';
import { notificationFields, requireActiveAccount, requireActivePlant, scheduleFields, scheduleTransaction, type ScheduleItem } from './store.js';

const uuid = z.uuid();
const scheduleInput = z.strictObject({
  plantId: uuid,
  activity: z.enum(['watering', 'fertilizing', 'observation', 'pruning', 'repotting', 'custom']),
  title: z.string().trim().min(1).max(120).refine(value => !value.includes('\0')),
  startDate: z.string().refine(validLocalDate),
  time: z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/),
  recurrence: z.enum(['once', 'daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(365),
  active: z.boolean(),
});
const createInput = scheduleInput.extend({ clientId: uuid.optional() });
const updateInput = scheduleInput.partial().refine(value => Object.keys(value).length > 0);
const schedulePage = z.strictObject({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
const notificationPage = z.strictObject({
  cursor: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine(value => BigInt(value) <= 9_223_372_036_854_775_807n).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const empty = z.strictObject({});
const missing = () => new HttpError(404, 'SCHEDULE_NOT_FOUND', 'Không tìm thấy lịch chăm sóc.');

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_INPUT', 'Kiểm tra cây, tên lịch, ngày giờ và chu kỳ đã nhập.');
  return result.data;
}

export function createScheduleRouter(pool: Pool, requireSession: RequestHandler, requireCsrf: RequestHandler) {
  const router = Router();
  const writes = new AttemptWindow(120);
  const limitWrites: RequestHandler = (req, res, next) => {
    const wait = writes.retryAfter(req.auth!.user.id);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      throw new HttpError(429, 'SCHEDULE_RATE_LIMIT', 'Bạn đã thao tác nhiều lần. Vui lòng chờ rồi thử lại.');
    }
    next();
  };

  router.get('/schedules', requireSession, async (req, res) => {
    const { cursor, limit } = parse(schedulePage, req.query);
    const { rows } = await pool.query<ScheduleItem>(`
      SELECT ${scheduleFields} FROM care_schedules schedule
      WHERE schedule.tai_khoan_id = $1 AND schedule.xoa_luc IS NULL AND ($2::uuid IS NULL OR schedule.id > $2)
      ORDER BY schedule.id LIMIT $3
    `, [req.auth!.user.id, cursor ?? null, limit + 1]);
    const items = rows.slice(0, limit);
    res.json({ items, nextCursor: rows.length > limit ? items.at(-1)!.id : null });
  });

  router.post('/schedules', requireSession, requireCsrf, limitWrites, async (req, res) => {
    const input = parse(createInput, req.body);
    const owner = req.auth!.user.id;
    const result = await scheduleTransaction(pool, async client => {
      await requireActiveAccount(client, owner);
      if (input.clientId) {
        const { rows: [existing] } = await client.query<ScheduleItem & { deleted: boolean }>(`
          SELECT ${scheduleFields}, schedule.xoa_luc IS NOT NULL AS deleted
          FROM care_schedules schedule WHERE schedule.tai_khoan_id = $1 AND schedule.client_id = $2
        `, [owner, input.clientId]);
        if (existing?.deleted) throw new HttpError(410, 'SCHEDULE_DELETED', 'Lịch đã được xóa khỏi tài khoản.');
        if (existing) {
          const { deleted: _deleted, ...schedule } = existing;
          return { schedule, created: false };
        }
      }
      await requireActivePlant(client, owner, input.plantId);
      const { rows: [count] } = await client.query<{ total: number }>(`
        SELECT count(*)::int AS total FROM care_schedules WHERE tai_khoan_id = $1 AND xoa_luc IS NULL
      `, [owner]);
      if (count!.total >= 500) throw new HttpError(409, 'SCHEDULE_LIMIT', 'Tài khoản đã có 500 lịch. Hãy xóa lịch không còn dùng.');
      const { rows: [schedule] } = await client.query<ScheduleItem>(`
        INSERT INTO care_schedules AS schedule
          (tai_khoan_id, cay_nguoi_dung_id, client_id, hoat_dong, tieu_de, ngay_bat_dau, gio_hen,
            loai_lap, khoang_lap, dang_bat, den_han_luc)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING ${scheduleFields}
      `, [owner, input.plantId, input.clientId ?? null, input.activity, input.title, input.startDate, input.time,
        input.recurrence, input.interval, input.active, input.active ? initialOccurrence(input, new Date()) : null]);
      return { schedule: schedule!, created: true };
    });
    res.status(result.created ? 201 : 200).json(result.schedule);
  });

  router.patch('/schedules/:scheduleId', requireSession, requireCsrf, limitWrites, async (req, res) => {
    const scheduleId = parse(uuid, req.params.scheduleId);
    const patch = parse(updateInput, req.body);
    const owner = req.auth!.user.id;
    const saved = await scheduleTransaction(pool, async client => {
      await requireActiveAccount(client, owner);
      const { rows: [before] } = await client.query<ScheduleItem>(`
        SELECT ${scheduleFields} FROM care_schedules schedule
        WHERE schedule.id = $1 AND schedule.tai_khoan_id = $2 AND schedule.xoa_luc IS NULL FOR UPDATE
      `, [scheduleId, owner]);
      if (!before) throw missing();
      const next = { ...before, ...patch };
      if (next.active || patch.plantId !== undefined) await requireActivePlant(client, owner, next.plantId);
      const changedTiming = next.startDate !== before.startDate || next.time !== before.time
        || next.recurrence !== before.recurrence || next.interval !== before.interval;
      const nextRunAt = next.active
        ? changedTiming || !before.active ? initialOccurrence(next, new Date()) : before.nextRunAt
        : null;
      const { rows: [schedule] } = await client.query<ScheduleItem>(`
        UPDATE care_schedules AS schedule SET cay_nguoi_dung_id = $3, hoat_dong = $4, tieu_de = $5,
          ngay_bat_dau = $6, gio_hen = $7, loai_lap = $8, khoang_lap = $9, dang_bat = $10,
          den_han_luc = $11, cap_nhat_luc = clock_timestamp()
        WHERE id = $1 AND tai_khoan_id = $2 RETURNING ${scheduleFields}
      `, [scheduleId, owner, next.plantId, next.activity, next.title, next.startDate, next.time,
        next.recurrence, next.interval, next.active, nextRunAt]);
      return schedule!;
    });
    res.json(saved);
  });

  router.delete('/schedules/:scheduleId', requireSession, requireCsrf, limitWrites, async (req, res) => {
    const scheduleId = parse(uuid, req.params.scheduleId);
    const owner = req.auth!.user.id;
    await scheduleTransaction(pool, async client => {
      await requireActiveAccount(client, owner);
      const { rowCount } = await client.query(`UPDATE care_schedules SET xoa_luc = clock_timestamp(),
        dang_bat = false, den_han_luc = NULL, cap_nhat_luc = clock_timestamp()
        WHERE id = $1 AND tai_khoan_id = $2 AND xoa_luc IS NULL`, [scheduleId, owner]);
      if (!rowCount) throw missing();
    });
    res.status(204).end();
  });

  router.get('/notifications', requireSession, async (req, res) => {
    const { cursor, limit } = parse(notificationPage, req.query);
    const owner = req.auth!.user.id;
    const { rows } = await pool.query<{ notification: Record<string, unknown> | null; unreadCount: number }>(`
      SELECT (SELECT count(*)::int FROM notifications WHERE tai_khoan_id = $1 AND doc_luc IS NULL) AS "unreadCount",
        CASE WHEN entry.id IS NULL THEN NULL ELSE to_jsonb(entry) END AS notification
      FROM (SELECT 1) anchor LEFT JOIN LATERAL (
        SELECT ${notificationFields}, thu_tu::text AS cursor FROM notifications
        WHERE tai_khoan_id = $1 AND ($2::bigint IS NULL OR thu_tu < $2)
        ORDER BY thu_tu DESC LIMIT $3
      ) entry ON true
    `, [owner, cursor ?? null, limit + 1]);
    const entries = rows.flatMap(row => row.notification ? [row.notification] : []);
    const page = entries.slice(0, limit);
    res.json({ items: page.map(({ cursor: _cursor, ...item }) => item),
      nextCursor: entries.length > limit ? page.at(-1)!.cursor : null, unreadCount: rows[0]?.unreadCount ?? 0 });
  });

  router.patch('/notifications/read-all', requireSession, requireCsrf, async (req, res) => {
    parse(empty, req.body);
    const { rowCount } = await pool.query(`UPDATE notifications SET doc_luc = clock_timestamp()
      WHERE tai_khoan_id = $1 AND doc_luc IS NULL`, [req.auth!.user.id]);
    res.json({ updated: rowCount });
  });

  router.patch('/notifications/:notificationId/read', requireSession, requireCsrf, async (req, res) => {
    const notificationId = parse(uuid, req.params.notificationId);
    parse(empty, req.body);
    const { rows: [notification] } = await pool.query(`UPDATE notifications SET doc_luc = COALESCE(doc_luc, clock_timestamp())
      WHERE id = $1 AND tai_khoan_id = $2 RETURNING ${notificationFields}`, [notificationId, req.auth!.user.id]);
    if (!notification) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo.');
    res.json(notification);
  });

  return router;
}
