import type { Pool } from 'pg';
import { HttpError } from '../../errors.js';
import { screeningSpecies } from '../diagnosis/guidance.js';
import { careActivities } from '../journal/records.js';

type Activity = (typeof careActivities)[number];
const labels: Record<Activity, string> = { watering: 'tưới nước', fertilizing: 'bón phân', observation: 'quan sát cây' };
const localDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

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
    ORDER BY l.xay_ra_luc DESC, l.id DESC LIMIT 5
  `, [id, owner]);
  return { ...plant, speciesCode, activities };
}

export function describeChatPlant(plant: NonNullable<Awaited<ReturnType<typeof readChatPlant>>>) {
  const last = plant.activities[0];
  const history = last
    ? `Hoạt động gần nhất đã ghi là ${labels[last.activity]} ngày ${localDate.format(last.at)}.`
    : 'Hồ sơ chưa có hoạt động chăm sóc nào.';
  return `Mình đã mở hồ sơ “${plant.nickname}”. ${history} Bạn muốn xem lần tưới gần nhất hay mô tả một dấu hiệu đang thấy trên cây?`;
}
