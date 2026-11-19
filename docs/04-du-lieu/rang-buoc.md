# Ràng buộc PostgreSQL cho ERD v2

Các đoạn SQL dưới đây giải thích ràng buộc nền tảng. Migration thực thi là nguồn thật; không chạy lại ALTER/CREATE mẫu trên database đã migrate. Phần cuối mô tả bổ sung `0009`–`0011`. [Tổng quan dữ liệu](README.md)

## Chủ sở hữu, loài và số lượng bản ghi

```sql
ALTER TABLE user_plants
  ALTER COLUMN tai_khoan_id SET NOT NULL,
  ALTER COLUMN loai_cay_id SET NOT NULL,
  ADD UNIQUE (id, tai_khoan_id, loai_cay_id);

ALTER TABLE images
  ALTER COLUMN tai_khoan_id SET NOT NULL,
  ADD UNIQUE (id, tai_khoan_id);

ALTER TABLE diseases
  ALTER COLUMN loai_cay_id SET NOT NULL,
  ALTER COLUMN ma SET NOT NULL,
  ADD UNIQUE (id, loai_cay_id),
  ADD UNIQUE (loai_cay_id, ma);

ALTER TABLE disease_guides
  ALTER COLUMN benh_id SET NOT NULL,
  ALTER COLUMN phien_ban SET NOT NULL,
  ADD UNIQUE (id, benh_id),
  ADD UNIQUE (benh_id, phien_ban);

CREATE UNIQUE INDEX disease_guides_one_published_per_disease
  ON disease_guides (benh_id)
  WHERE trang_thai = 'published';

ALTER TABLE diagnoses
  ALTER COLUMN tai_khoan_id SET NOT NULL,
  ALTER COLUMN anh_id SET NOT NULL,
  ALTER COLUMN loai_cay_chon_id SET NOT NULL,
  ALTER COLUMN khoa_idempotency_bam SET NOT NULL,
  ALTER COLUMN request_bam SET NOT NULL,
  ADD UNIQUE (anh_id),
  ADD UNIQUE (tai_khoan_id, khoa_idempotency_bam),
  ADD FOREIGN KEY (loai_cay_chon_id) REFERENCES plant_species (id),
  ADD FOREIGN KEY (cay_nguoi_dung_id, tai_khoan_id, loai_cay_chon_id)
    REFERENCES user_plants (id, tai_khoan_id, loai_cay_id) MATCH SIMPLE,
  ADD FOREIGN KEY (anh_id, tai_khoan_id) REFERENCES images (id, tai_khoan_id),
  ADD FOREIGN KEY (benh_du_doan_id, loai_cay_chon_id) REFERENCES diseases (id, loai_cay_id),
  ADD FOREIGN KEY (huong_dan_id, benh_du_doan_id) REFERENCES disease_guides (id, benh_id);

ALTER TABLE diagnosis_jobs
  ALTER COLUMN so_lan_thu SET NOT NULL,
  ALTER COLUMN so_lan_thu SET DEFAULT 0,
  ALTER COLUMN kha_dung_luc SET NOT NULL,
  ALTER COLUMN kha_dung_luc SET DEFAULT now(),
  ADD PRIMARY KEY (chan_doan_id),
  ADD FOREIGN KEY (chan_doan_id) REFERENCES diagnoses (id) ON DELETE CASCADE,
  ADD CHECK (so_lan_thu >= 0),
  ADD CHECK ((token_nhan IS NULL) = (het_han_thue_luc IS NULL));
```

Khóa ngoại ba cột dùng `MATCH SIMPLE`. Khi `cay_nguoi_dung_id` là `NULL`, khóa ngoại riêng đến `plant_species` vẫn kiểm tra loài đã chọn. `UNIQUE (anh_id)` cho phép ảnh chưa có chẩn đoán, ví dụ ảnh đang chờ xóa. Job bắt buộc ở luồng tạo chẩn đoán nhờ cùng giao dịch. `PRIMARY KEY` giữ tối đa một job cho mỗi chẩn đoán. [Khóa ngoại PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK) · [Chỉ mục duy nhất có điều kiện](https://www.postgresql.org/docs/current/indexes-partial.html)

## Trạng thái và kết quả chẩn đoán

```sql
ALTER TABLE diagnoses
  ALTER COLUMN trang_thai SET NOT NULL,
  ALTER COLUMN trang_thai SET DEFAULT 'queued',
  ADD CONSTRAINT diagnoses_valid_status
    CHECK (trang_thai IN ('queued', 'processing', 'completed', 'failed')),
  ADD CONSTRAINT diagnoses_valid_outcome
    CHECK (ket_qua IN ('disease', 'healthy', 'uncertain')),
  ADD CONSTRAINT diagnoses_result_matches_status CHECK (
    (trang_thai = 'completed') = (ket_qua IS NOT NULL)
    AND (trang_thai = 'completed') = (do_tin_cay IS NOT NULL)
    AND (trang_thai = 'completed') = (phien_ban_mo_hinh IS NOT NULL)
  ),
  ADD CONSTRAINT diagnoses_confidence_range CHECK (do_tin_cay BETWEEN 0 AND 1),
  ADD CONSTRAINT diagnoses_disease_matches_outcome
    CHECK ((ket_qua IS NOT DISTINCT FROM 'disease') = (benh_du_doan_id IS NOT NULL)),
  ADD CONSTRAINT diagnoses_guide_requires_disease
    CHECK (huong_dan_id IS NULL OR benh_du_doan_id IS NOT NULL),
  ADD CONSTRAINT diagnoses_error_matches_status
    CHECK ((trang_thai = 'failed') = (ma_loi IS NOT NULL)),
  ADD CONSTRAINT diagnoses_finish_time_matches_status
    CHECK ((trang_thai IN ('completed', 'failed')) = (hoan_tat_luc IS NOT NULL));
```

`uncertain` là một lần suy luận đã trả về điểm và phiên bản mô hình. Lỗi kỹ thuật sau khi hết lượt thử tự động đi theo `failed`. Các kiểm tra `IS NOT NULL` và `IS NOT DISTINCT FROM` giúp ràng buộc chặt các tổ hợp chứa `NULL`. [CHECK trong PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)

## Nhật ký quản trị

```sql
CREATE TABLE admin_audit_logs (
  nguoi_thuc_hien_id uuid REFERENCES accounts (id) ON DELETE SET NULL,
  hanh_dong text NOT NULL,
  loai_doi_tuong text NOT NULL,
  doi_tuong_id uuid NOT NULL,
  xay_ra_luc timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (loai_doi_tuong = 'species' AND hanh_dong IN ('create_species', 'update_species'))
    OR (loai_doi_tuong = 'disease' AND hanh_dong IN ('create_disease', 'update_disease'))
    OR (loai_doi_tuong = 'guide' AND hanh_dong IN ('create_guide', 'publish_guide', 'archive_guide'))
    OR (loai_doi_tuong = 'account' AND hanh_dong IN ('deactivate_account', 'activate_account', 'grant_admin'))
    OR (loai_doi_tuong = 'post' AND hanh_dong IN ('hide_post', 'unhide_post'))
  )
);
```

API xác thực quyền Admin và thêm log cùng giao dịch thay đổi. Khi xuất bản hướng dẫn mới thay thế một bản đang dùng, ghi `archive_guide` cho bản cũ và `publish_guide` cho bản mới. Bảng ghi thêm theo sự kiện với đúng năm trường trong thiết kế. `doi_tuong_id` giữ mã đối tượng sau khi bản ghi gốc bị xóa.

## Ràng buộc bổ sung 0009–0011

Nguồn chính xác là [0009](../../backend/migrations/0009_community_posts.sql), [0010](../../backend/migrations/0010_admin.sql), [0011](../../backend/migrations/0011_schedules.sql); không chạy lại các ví dụ ALTER ở trên trên database đã migrate.

- Bài viết giữ `UNIQUE(id,tai_khoan_id)` và FK ghép về cây cùng chủ. Tiêu đề 1–120, ghi chú tối đa 4000; mỗi cảm xúc duy nhất theo tài khoản/bài, CHECK chỉ nhận heart/cry/laugh.
- Bình luận có `UNIQUE(id,post_id)` và FK `(parent_id,post_id)` về cùng bài; parent không được là chính mình. API chỉ cho tạo trả lời đến bản ghi tồn tại, không đổi parent sau tạo. Body tối đa 1000; một like mỗi tài khoản/bình luận.
- Hai bảng ảnh ghép cả đối tượng và ảnh với cùng tài khoản; `position` 0–3 và PK `(post_id,position)` hoặc `(comment_id,position)` giới hạn bốn ảnh/đối tượng. Trigger khi gỡ ảnh đánh dấu `pending_delete` nếu không còn tham chiếu; worker xóa object sau.
- Audit mở rộng cặp account với deactivate_account/activate_account/grant_admin và post với hide_post/unhide_post. Không thêm payload chứa hồ sơ, email, token hoặc nội dung trước/sau.
- Lịch có FK `(cay_nguoi_dung_id,tai_khoan_id)` về cây cùng chủ, `UNIQUE(id,tai_khoan_id)` và `UNIQUE(tai_khoan_id,client_id)`. Giờ Việt Nam cố định, interval 1–365, activity và recurrence theo tập cố định. CHECK `dang_bat = (den_han_luc IS NOT NULL)` và lịch xóa phải tắt.
- Thông báo có `UNIQUE(lich_id,hen_luc)`, FK ghép tới lịch và cây cùng chủ. `doc_luc` chỉ là trạng thái đã đọc; không chứng minh chăm sóc đã hoàn thành.
- Transaction của worker khóa theo cùng advisory lock với CRUD lịch; unique vẫn giữ chống trùng ở database. Không cần bảng occurrence riêng cho lời nhắc trong app ở phạm vi này.

Quyền đọc ảnh là điều kiện API thay đổi theo thời điểm, không thể được thay bằng FK: ảnh cộng đồng phải đúng bài/cây và quyền chia sẻ còn hiệu lực trước lẫn sau khi tải từ kho. [Hợp đồng cộng đồng](../03-kien-truc/cong-dong.md)
