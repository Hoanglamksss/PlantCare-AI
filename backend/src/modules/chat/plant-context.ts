import type { Pool } from 'pg';
import { HttpError } from '../../errors.js';
import { screeningSpecies } from '../diagnosis/guidance.js';
import { careActivities } from '../journal/records.js';
import { scheduleTimezone } from '../schedules/recurrence.js';

type Activity = (typeof careActivities)[number];
const labels: Record<Activity, string> = { watering: 'tưới nước', fertilizing: 'bón phân', observation: 'quan sát cây' };
export const localDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: scheduleTimezone });
export const localDay = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: scheduleTimezone });

export async function readChatPlant(pool: Pool, owner: string, id: string) {
  const { rows: [plant] } = await pool.query<{ id: string; nickname: string; speciesCode: string; plantedOn: string | null }>(`
    SELECT p.id, p.biet_danh AS nickname, s.ma AS "speciesCode", p.ngay_trong::text AS "plantedOn"
    FROM user_plants p JOIN plant_species s ON s.id = p.loai_cay_id
    WHERE p.id = $1 AND p.tai_khoan_id = $2 AND p.luu_tru_luc IS NULL
  `, [id, owner]);
  const speciesCode = screeningSpecies.find(code => code === plant?.speciesCode);
  if (!plant || !speciesCode) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây đang theo dõi trong Vườn cây của bạn.');

  const { rows: activities } = await pool.query<{ activity: Activity; at: Date }>(`
    SELECT l.hoat_dong AS activity, l.xay_ra_luc AS at
    FROM care_logs l JOIN user_plants p ON p.id = l.cay_nguoi_dung_id AND p.tai_khoan_id = l.tai_khoan_id
    WHERE p.id = $1 AND p.tai_khoan_id = $2 AND p.luu_tru_luc IS NULL AND NOT l.la_ghi_chu
      AND l.xay_ra_luc <= now()
    ORDER BY l.xay_ra_luc DESC, l.id DESC LIMIT 5
  `, [id, owner]);
  return { ...plant, speciesCode, activities };
}

export type ChatPlant = Awaited<ReturnType<typeof readChatPlant>>;

export async function readPlantObservation(pool: Pool, owner: string, plantId: string) {
  const { rows: [observation] } = await pool.query<{ note: string; at: Date }>(`
    SELECT left(btrim(l.ghi_chu), 300) AS note, l.xay_ra_luc AS at
    FROM care_logs l JOIN user_plants p ON p.id = l.cay_nguoi_dung_id AND p.tai_khoan_id = l.tai_khoan_id
    WHERE p.id = $1 AND p.tai_khoan_id = $2 AND p.luu_tru_luc IS NULL
      AND l.hoat_dong = 'observation' AND btrim(l.ghi_chu) <> '' AND l.xay_ra_luc <= now()
    ORDER BY l.xay_ra_luc DESC, l.id DESC LIMIT 1
  `, [plantId, owner]);
  return observation;
}

export function describeActivity(plant: ChatPlant, today: string) {
  const activities = plant.activities.filter(({ at }) => localDay.format(at) === today);
  if (activities.length) {
    const recorded = [...new Set(activities.map(({ activity }) => labels[activity]))];
    return `Hôm nay nhật ký có ghi ${recorded.join(', ')}.`;
  }
  const last = plant.activities[0];
  return last ? `Hoạt động gần nhất là ${labels[last.activity]} ngày ${localDate.format(last.at)}.` : '';
}
