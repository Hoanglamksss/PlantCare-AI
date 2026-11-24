import type { Pool } from 'pg';
import { screeningGuidance } from '../diagnosis/guidance.js';

async function readScreening(pool: Pool, owner: string, target: { diagnosisId: string } | { plantId: string }) {
  const { rows: [row] } = await pool.query<{
    id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; speciesCode: string;
    outcome: string | null; retryable: boolean; plantId: string | null;
    screening: { findings: { code: string; label: string; detail: string }[] } | null; uploadedAt: Date;
  }>(`
    SELECT d.id, d.trang_thai AS status, s.ma AS "speciesCode", d.ket_qua AS outcome, d.cay_nguoi_dung_id AS "plantId",
      d.ket_qua_sang_loc AS screening, d.tao_luc AS "uploadedAt",
      (d.ma_loi IS NOT DISTINCT FROM 'SCREENING_UNAVAILABLE' AND i.trang_thai_luu_tru = 'ready') AS retryable
    FROM diagnoses d JOIN plant_species s ON s.id = d.loai_cay_chon_id
    JOIN images i ON i.id = d.anh_id AND i.tai_khoan_id = d.tai_khoan_id
    WHERE d.tai_khoan_id = $1 AND ${'diagnosisId' in target ? 'd.id = $2' : `
      d.cay_nguoi_dung_id = $2 AND d.trang_thai = 'completed' AND EXISTS (
        SELECT 1 FROM user_plants p WHERE p.id = d.cay_nguoi_dung_id
          AND p.tai_khoan_id = d.tai_khoan_id AND p.luu_tru_luc IS NULL
      ) ORDER BY d.tao_luc DESC, d.id DESC LIMIT 1`}
  `, [owner, 'diagnosisId' in target ? target.diagnosisId : target.plantId]);
  if (!row) return null;

  const findings = row.screening?.findings ?? [];
  const guidance = row.status === 'completed' ? screeningGuidance(row.speciesCode, row.outcome, findings) : null;
  const plan = guidance ? [
    { when: 'Hôm nay', steps: guidance.careSteps.slice(0, 2) },
    { when: 'Ngày mai', steps: ['Quan sát lại cùng lá và so sánh với ảnh hôm nay. Kiểm tra xem lá mới có dấu hiệu tương tự không.'] },
    { when: 'Sau 48–72 giờ', steps: ['Đánh giá dấu hiệu có lan rộng hay cây héo thêm không. Nếu tình trạng xấu nhanh, nhờ người có chuyên môn kiểm tra sớm.'] },
  ] : [];
  return {
    id: row.id, plantId: row.plantId, status: row.status, speciesCode: row.speciesCode, outcome: row.outcome,
    retryable: row.retryable, findings, guidance, plan, uploadedAt: row.uploadedAt,
  };
}

export async function loadChatScreening(pool: Pool, owner: string, diagnosisId: string) {
  const result = await readScreening(pool, owner, { diagnosisId });
  if (!result) return null;
  const { uploadedAt: _uploadedAt, ...screening } = result;
  return screening;
}

export function loadLatestPlantScreening(pool: Pool, owner: string, plantId: string) {
  return readScreening(pool, owner, { plantId });
}
