import type { Pool } from 'pg';
import { normalize } from './language.js';
import type { ScreeningSpecies } from '../diagnosis/guidance.js';

export type CareSource = { title: string; url: string };
export type Guide = CareSource & { text: string };

const generalWords = new Set('ban minh toi em anh toi hay gi co cua cay la bi cho ve loai mot thi nay lam'.split(' '));
export function selectGuides(guides: Guide[], query: string) {
  const terms = [...new Set(normalize(query).split(' ').filter(word => word.length >= 2 && !generalWords.has(word)))];
  return guides.flatMap((guide) => {
    try {
      if (!['http:', 'https:'].includes(new URL(guide.url).protocol)) return [];
    } catch { return []; }
    const title = new Set(normalize(guide.title).split(' '));
    const content = new Set(normalize(guide.text).split(' '));
    const score = terms.reduce((total, word) => total + (title.has(word) ? 3 : content.has(word) ? 1 : 0), 0);
    return score > 0 ? [{ guide, score }] : [];
  }).sort((a, b) => b.score - a.score).slice(0, 3).map(({ guide }) => guide);
}

export async function findGuides(pool: Pool, crop: ScreeningSpecies | undefined, query: string) {
  const { rows } = await pool.query<Guide>(`
    SELECT left(g.huong_dan, 1000) AS text, d.ten_vi AS title, g.nguon_url AS url
    FROM disease_guides g JOIN diseases d ON d.id = g.benh_id
    JOIN plant_species s ON s.id = d.loai_cay_id
    WHERE g.trang_thai = 'published' AND d.dang_hoat_dong AND s.dang_hoat_dong
      AND ($1::text IS NULL OR s.ma = $1)
    ORDER BY g.xuat_ban_luc DESC NULLS LAST, g.id LIMIT 60
  `, [crop ?? null]);
  return selectGuides(rows, query);
}

export function siteAnswer(words: string) {
  if (/\b(tao|dat|them|cai|len) lich (tuoi|cham|nhac)/.test(words) || /\blich tuoi o dau\b/.test(words)) {
    return 'Vào Đặt lịch, chọn cây, hoạt động Tưới nước, ngày giờ và chu kỳ nếu cần, rồi lưu. Nhắc lịch xuất hiện ở biểu tượng chuông trong ứng dụng.';
  }
  if (/\b(doi|cap nhat|thay doi) (dia chi )?email\b/.test(words)) {
    return 'Vào Hồ sơ và chọn Đổi email. Nhập địa chỉ mới, mật khẩu hiện tại và làm theo chỉ dẫn ở bước xác minh.';
  }
  if (/\b(doi|sua|thay) (mat khau|mk)\b/.test(words)) {
    return 'Vào Hồ sơ → Đổi mật khẩu. Nhập mật khẩu hiện tại và mật khẩu mới, rồi đăng nhập lại sau khi lưu.';
  }
  if (/\b(xac minh email|ma otp|gui ma xac minh)\b/.test(words)) {
    return 'Vào Hồ sơ → Xác minh email → Gửi mã. Kiểm tra hộp thư đến hoặc thư rác, rồi nhập mã 6 số trong 10 phút.';
  }
  if (/\b(dang bai|chia se cay|chia se anh)\b/.test(words)) {
    return 'Vào Cộng đồng để viết bài về một cây trong vườn của bạn. Chọn cây, nhập nội dung hoặc thêm ảnh, rồi bấm Đăng bài.';
  }
  if (/\b(them|tao) (cay|ho so cay) (?:moi |vao )?(?:trong |vao )?vuon cay\b|\bho so cay o dau\b/.test(words)) {
    return 'Mở Vườn cây, chọn bắt đầu theo dõi hoặc thêm cây, rồi chọn loài và đặt tên cho cây. Bạn có thể mở hồ sơ đó để ghi nhật ký hoặc đặt lịch.';
  }
  if (/\b(gui|dinh kem|tai) anh (?:la )?(?:o dau|the nao|vao chat|trong chat)\b/.test(words)) {
    return 'Mở nút + trong ô chat, chọn loại cây hoặc đính kèm hồ sơ cây, rồi chọn Đính kèm ảnh lá để gửi. Sau khi có kết quả, chọn “Hỏi về ảnh này” để hỏi tiếp.';
  }
  if (/\b(xem lich su|xem lai) (kiem tra|chan doan|anh|sang loc)/.test(words)) {
    return 'Mở mục Chẩn đoán để xem các lần đã kiểm tra. Nếu gửi ảnh trong Trợ lý AI, bạn cũng có thể chọn “Hỏi về ảnh này” ngay trong chat.';
  }
  if (/\b(plantcare (la gi|lam duoc gi|co (gi|chuc nang gi))|web (nay )?(co (gi|chuc nang gi)|lam duoc gi)|(?:ban|bot) (?:co the )?(?:la ai|giup (?:duoc )?gi|lam (?:duoc )?gi))\b/.test(words)) {
    return 'PlantCare giúp bạn quản lý vườn cây, lưu nhật ký, đặt lịch chăm sóc, sàng lọc dấu hiệu qua ảnh lá và chia sẻ với cộng đồng.';
  }
  return null;
}

const localTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export async function latestWatering(pool: Pool, owner: string, crop: ScreeningSpecies | undefined, words: string, plantId?: string) {
  const { rows } = await pool.query<{ id: string; name: string }>(`
    SELECT p.id, p.biet_danh AS name
    FROM user_plants p JOIN plant_species s ON s.id = p.loai_cay_id
    WHERE p.tai_khoan_id = $1 AND p.luu_tru_luc IS NULL AND ($2::text IS NULL OR s.ma = $2)
      AND ($3::uuid IS NULL OR p.id = $3)
    ORDER BY p.id
  `, [owner, crop ?? null, plantId ?? null]);
  if (!rows.length) return 'Mình chưa thấy cây phù hợp trong Vườn cây của bạn.';
  const byName = rows.filter((plant) => {
    const name = normalize(plant.name);
    return name.length >= 2 && ` ${words} `.includes(` ${name} `);
  });
  const candidates = byName.length ? byName : rows;
  if (candidates.length !== 1) {
    return `Bạn muốn hỏi cây nào? Hãy gõ tên cây trong Vườn cây, ví dụ ${candidates.slice(0, 3).map((plant) => `“${plant.name}”`).join(', ')}.`;
  }
  const plant = candidates[0]!;
  const { rows: [entry] } = await pool.query<{ at: Date }>(`
    SELECT l.xay_ra_luc AS at FROM care_logs l
    JOIN user_plants p ON p.id = l.cay_nguoi_dung_id AND p.tai_khoan_id = l.tai_khoan_id
    WHERE p.id = $2 AND p.tai_khoan_id = $1 AND p.luu_tru_luc IS NULL
      AND l.hoat_dong = 'watering' AND NOT l.la_ghi_chu
    ORDER BY l.xay_ra_luc DESC, l.id DESC LIMIT 1
  `, [owner, plant.id]);
  return entry ? `Lần tưới gần nhất được ghi cho “${plant.name}” là ${localTime.format(entry.at)} (giờ Việt Nam).`
    : `Nhật ký của “${plant.name}” chưa có lần tưới nào.`;
}
