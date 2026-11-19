import type { Pool } from 'pg';
import { latestOccurrence, nextOccurrence } from './recurrence.js';
import { scheduleFields, scheduleLock, type ScheduleItem } from './store.js';

interface DueSchedule extends ScheduleItem {
  owner: string;
  nickname: string;
}

const labels: Record<ScheduleItem['activity'], string> = {
  watering: 'tưới nước', fertilizing: 'bón phân', observation: 'quan sát',
  pruning: 'cắt tỉa', repotting: 'thay chậu', custom: 'chăm sóc',
};

export async function processDueSchedules(pool: Pool): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [lock] } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS locked', [...scheduleLock],
    );
    if (!lock?.locked) {
      await client.query('COMMIT');
      return 0;
    }
    const { rows: [clock] } = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const now = clock!.now;
    const { rows } = await client.query<DueSchedule>(`
      SELECT ${scheduleFields}, schedule.tai_khoan_id AS owner, plant.biet_danh AS nickname
      FROM care_schedules schedule
      JOIN accounts account ON account.id = schedule.tai_khoan_id
      JOIN user_plants plant ON plant.id = schedule.cay_nguoi_dung_id AND plant.tai_khoan_id = schedule.tai_khoan_id
      WHERE schedule.dang_bat AND schedule.xoa_luc IS NULL AND schedule.den_han_luc <= $1
        AND account.yeu_cau_xoa_luc IS NULL AND plant.luu_tru_luc IS NULL
      ORDER BY schedule.den_han_luc LIMIT 50 FOR UPDATE OF schedule SKIP LOCKED
    `, [now]);
    let created = 0;
    for (const schedule of rows) {
      const { rowCount: activeAccount } = await client.query(`
        SELECT id FROM accounts WHERE id = $1 AND yeu_cau_xoa_luc IS NULL FOR SHARE
      `, [schedule.owner]);
      const { rowCount: activePlant } = await client.query(`
        SELECT id FROM user_plants WHERE id = $1 AND tai_khoan_id = $2 AND luu_tru_luc IS NULL FOR SHARE
      `, [schedule.plantId, schedule.owner]);
      if (!activeAccount || !activePlant) continue;

      const scheduledAt = latestOccurrence(schedule, now);
      if (scheduledAt) {
        const { rowCount } = await client.query(`
          INSERT INTO notifications (tai_khoan_id, cay_nguoi_dung_id, lich_id, hen_luc, tieu_de, noi_dung)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lich_id, hen_luc) DO NOTHING
        `, [schedule.owner, schedule.plantId, schedule.id, scheduledAt, schedule.title,
          `Đến giờ ${labels[schedule.activity]} cho ${schedule.nickname}.`]);
        created += rowCount ?? 0;
      }
      const next = schedule.recurrence === 'once' ? null : nextOccurrence(schedule, new Date(now.getTime() + 1));
      await client.query(`UPDATE care_schedules SET den_han_luc = $2, dang_bat = ($2::timestamptz IS NOT NULL),
        cap_nhat_luc = clock_timestamp() WHERE id = $1`, [schedule.id, next]);
    }
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function startScheduleWorker(pool: Pool): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void>;
  let failureCount = 0;

  async function tick(): Promise<void> {
    let delay = 10_000;
    try {
      const count = await processDueSchedules(pool);
      failureCount = 0;
      if (count >= 50) delay = 1_000;
    } catch {
      failureCount += 1;
      delay = Math.min(60_000, 5_000 * 2 ** Math.min(failureCount, 4));
      console.error('[schedules] tick_failed');
    }
    if (!stopped) {
      timer = setTimeout(() => { pending = tick(); }, delay);
      timer.unref();
    }
  }

  pending = tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await pending;
  };
}
