import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../../errors.js';
import { cleanPendingPhoto } from '../media/photos.js';
import { type Analysis, type PhotoServices, MissingPhoto } from '../media/services.js';

export async function lockQueue<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(87234811, 3)');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function checkCapacity(client: PoolClient, accountId: string) {
  const { rows: [count] } = await client.query<{ own: number; total: number }>(`
    SELECT count(*) FILTER (WHERE tai_khoan_id = $1)::int AS own, count(*)::int AS total
    FROM diagnoses WHERE trang_thai IN ('queued', 'processing')
  `, [accountId]);
  if (!count) throw new Error('Missing screening queue size');
  if (count.own >= 3) {
    throw new HttpError(429, 'SCREENING_LIMIT', 'Bạn có 3 ảnh đang chờ xử lý. Vui lòng đợi kết quả trước khi gửi thêm.');
  }
  if (count.total >= 30) {
    throw new HttpError(503, 'SCREENING_BUSY', 'Hàng đợi đang đầy. Vui lòng thử lại sau ít phút.');
  }
}

interface Job {
  id: string;
  key: string;
  lease: string;
  attempt: number;
}

const attemptLimit = 3;

async function claimJob(pool: Pool): Promise<Job | undefined> {
  return lockQueue(pool, async (client) => {
    const { rows } = await client.query<Job>(`
      WITH candidate AS (
        SELECT j.chan_doan_id FROM diagnosis_jobs j JOIN diagnoses d ON d.id = j.chan_doan_id
        WHERE (d.trang_thai = 'queued' AND j.kha_dung_luc <= now())
           OR (d.trang_thai = 'processing' AND j.het_han_thue_luc <= now())
        ORDER BY j.kha_dung_luc, j.chan_doan_id LIMIT 1
      ), claimed AS (
        UPDATE diagnosis_jobs j
        SET token_nhan = gen_random_uuid(), het_han_thue_luc = now() + interval '45 seconds',
            so_lan_thu = so_lan_thu + 1
        FROM candidate c WHERE j.chan_doan_id = c.chan_doan_id
        RETURNING j.chan_doan_id, j.token_nhan, j.so_lan_thu
      )
      UPDATE diagnoses d SET trang_thai = 'processing'
      FROM claimed c, images i
      WHERE d.id = c.chan_doan_id AND i.id = d.anh_id
      RETURNING d.id, i.khoa_doi_tuong AS key, c.token_nhan AS lease, c.so_lan_thu AS attempt
    `);
    return rows[0];
  });
}

async function finish(pool: Pool, job: Job, result: Analysis | 'missing' | 'unavailable') {
  await lockQueue(pool, async (client) => {
    const { rowCount } = await client.query(`
      UPDATE diagnosis_jobs SET token_nhan = NULL, het_han_thue_luc = NULL,
        kha_dung_luc = now() + make_interval(secs => $3)
      WHERE chan_doan_id = $1 AND token_nhan = $2 AND het_han_thue_luc > now()
    `, [job.id, job.lease, job.attempt * 5]);
    if (rowCount !== 1) return;
    if (typeof result === 'object') {
      await client.query(`
        UPDATE diagnoses SET trang_thai = 'completed', ket_qua = $2, do_tin_cay = $3,
          phien_ban_mo_hinh = $4, ket_qua_sang_loc = $5, hoan_tat_luc = now()
        WHERE id = $1
      `, [job.id, result.outcome, result.quality, result.modelVersion,
        { findings: result.findings }]);
      return;
    }
    if (result === 'unavailable' && job.attempt < attemptLimit) {
      await client.query("UPDATE diagnoses SET trang_thai = 'queued' WHERE id = $1", [job.id]);
      return;
    }
    await client.query(`
      UPDATE diagnoses SET trang_thai = 'failed', ma_loi = $2, hoan_tat_luc = now()
      WHERE id = $1
    `, [job.id, result === 'missing' ? 'PHOTO_UNAVAILABLE' : 'SCREENING_UNAVAILABLE']);
  });
}

export function startDiagnosisWorker(pool: Pool, services: PhotoServices) {
  let busy = false;
  let cleanupAt = 0;
  let purgeKeysAt = 0;
  let nextErrorLogAt = 0;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const job = await claimJob(pool);
      if (job) {
        let result: Analysis | 'missing' | 'unavailable' = 'unavailable';
        if (job.attempt <= attemptLimit) {
          try {
            result = await services.analyze(await services.get(job.key));
          } catch (error) {
            if (error instanceof MissingPhoto) result = 'missing';
          }
        }
        await finish(pool, job, result);
      }
      if (cleanupAt <= Date.now()) {
        cleanupAt = Date.now() + 4_000;
        await cleanPendingPhoto(pool, services);
      }
      if (purgeKeysAt <= Date.now()) {
        purgeKeysAt = Date.now() + 60_000;
        await pool.query('DELETE FROM deleted_diagnosis_keys WHERE het_han_luc <= now()');
      }
    } catch {
      // A restart or a transient database/storage failure is recoverable through the job lease.
      if (nextErrorLogAt <= Date.now()) {
        nextErrorLogAt = Date.now() + 60_000;
        console.error('[screening] worker_tick_failed');
      }
    } finally {
      busy = false;
    }
  }
  setInterval(() => void tick(), 1_500).unref();
}
