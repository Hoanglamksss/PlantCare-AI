import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../../errors.js';
import type { ScheduleRule } from './recurrence.js';

export const scheduleLock = [87234811, 4] as const;
export const scheduleFields = `schedule.id, schedule.cay_nguoi_dung_id AS "plantId", schedule.hoat_dong AS activity,
  schedule.tieu_de AS title, to_char(schedule.ngay_bat_dau, 'YYYY-MM-DD') AS "startDate",
  to_char(schedule.gio_hen, 'HH24:MI') AS time, schedule.loai_lap AS recurrence,
  schedule.khoang_lap AS interval, schedule.dang_bat AS active, schedule.den_han_luc AS "nextRunAt",
  schedule.mui_gio AS timezone`;

export interface ScheduleItem extends ScheduleRule {
  id: string;
  plantId: string;
  activity: 'watering' | 'fertilizing' | 'observation' | 'pruning' | 'repotting' | 'custom';
  title: string;
  active: boolean;
  nextRunAt: Date | null;
  timezone: string;
}

export const notificationFields = `id, tieu_de AS title, noi_dung AS body, cay_nguoi_dung_id AS "plantId",
  tao_luc AS "createdAt", doc_luc AS "readAt"`;

export async function scheduleTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [...scheduleLock]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function requireActiveAccount(client: PoolClient, owner: string): Promise<void> {
  const { rowCount } = await client.query(`
    SELECT id FROM accounts WHERE id = $1 AND yeu_cau_xoa_luc IS NULL FOR SHARE
  `, [owner]);
  if (!rowCount) throw new HttpError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập.');
}

export async function requireActivePlant(client: PoolClient, owner: string, plantId: string): Promise<void> {
  const { rows: [plant] } = await client.query<{ archived: boolean }>(`
    SELECT luu_tru_luc IS NOT NULL AS archived FROM user_plants
    WHERE id = $1 AND tai_khoan_id = $2 FOR SHARE
  `, [plantId, owner]);
  if (!plant) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây.');
  if (plant.archived) throw new HttpError(409, 'PLANT_ARCHIVED', 'Khôi phục cây đang lưu trữ trước khi bật lịch chăm sóc.');
}
