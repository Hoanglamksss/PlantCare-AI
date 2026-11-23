import type { Pool } from 'pg';
import { HttpError } from '../../errors.js';
import { screeningSpecies } from '../diagnosis/guidance.js';

export async function readChatPlant(pool: Pool, owner: string, id: string) {
  const { rows: [plant] } = await pool.query<{ id: string; nickname: string; speciesCode: string; plantedOn: string | null }>(`
    SELECT p.id, p.biet_danh AS nickname, s.ma AS "speciesCode", p.ngay_trong::text AS "plantedOn"
    FROM user_plants p JOIN plant_species s ON s.id = p.loai_cay_id
    WHERE p.id = $1 AND p.tai_khoan_id = $2 AND p.luu_tru_luc IS NULL
  `, [id, owner]);
  const speciesCode = screeningSpecies.find(code => code === plant?.speciesCode);
  if (!plant || !speciesCode) throw new HttpError(404, 'PLANT_NOT_FOUND', 'Không tìm thấy cây đang theo dõi trong Vườn cây của bạn.');

  const { rows: activities } = await pool.query<{ activity: string; at: Date }>(`
    SELECT l.hoat_dong AS activity, l.xay_ra_luc AS at
    FROM care_logs l JOIN user_plants p ON p.id = l.cay_nguoi_dung_id AND p.tai_khoan_id = l.tai_khoan_id
    WHERE p.id = $1 AND p.tai_khoan_id = $2 AND p.luu_tru_luc IS NULL AND NOT l.la_ghi_chu
    ORDER BY l.xay_ra_luc DESC, l.id DESC LIMIT 5
  `, [id, owner]);
  return { ...plant, speciesCode, activities };
}
