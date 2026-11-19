CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  mat_khau_bam text NOT NULL,
  vai_tro text NOT NULL DEFAULT 'user' CHECK (vai_tro IN ('user', 'admin')),
  yeu_cau_xoa_luc timestamptz
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_bam text NOT NULL UNIQUE,
  het_han_luc timestamptz NOT NULL,
  thu_hoi_luc timestamptz
);

CREATE TABLE plant_species (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ma text NOT NULL UNIQUE,
  ten_vi text NOT NULL,
  dang_hoat_dong boolean NOT NULL DEFAULT true
);

CREATE TABLE user_plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id),
  loai_cay_id uuid NOT NULL REFERENCES plant_species (id),
  biet_danh text NOT NULL,
  ghi_chu text,
  ngay_trong date,
  luu_tru_luc timestamptz,
  UNIQUE (id, tai_khoan_id, loai_cay_id)
);

CREATE TABLE care_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cay_nguoi_dung_id uuid NOT NULL REFERENCES user_plants (id) ON DELETE CASCADE,
  hoat_dong text NOT NULL,
  ghi_chu text,
  xay_ra_luc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diseases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loai_cay_id uuid NOT NULL REFERENCES plant_species (id),
  ma text NOT NULL,
  ten_vi text NOT NULL,
  dang_hoat_dong boolean NOT NULL DEFAULT true,
  UNIQUE (id, loai_cay_id),
  UNIQUE (loai_cay_id, ma)
);

CREATE TABLE disease_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benh_id uuid NOT NULL REFERENCES diseases (id),
  nguoi_duyet_id uuid REFERENCES accounts (id) ON DELETE SET NULL,
  phien_ban int NOT NULL CHECK (phien_ban > 0),
  trang_thai text NOT NULL DEFAULT 'draft' CHECK (trang_thai IN ('draft', 'published', 'retired')),
  huong_dan text NOT NULL,
  nguon_url text NOT NULL,
  xuat_ban_luc timestamptz,
  UNIQUE (id, benh_id),
  UNIQUE (benh_id, phien_ban)
);

CREATE UNIQUE INDEX disease_guides_one_published_per_disease
  ON disease_guides (benh_id) WHERE trang_thai = 'published';

CREATE TABLE images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id),
  khoa_doi_tuong text NOT NULL UNIQUE,
  loai_mime text NOT NULL,
  kich_thuoc_byte int NOT NULL CHECK (kich_thuoc_byte > 0),
  trang_thai_luu_tru text NOT NULL DEFAULT 'ready'
    CHECK (trang_thai_luu_tru IN ('ready', 'pending_delete')),
  thu_xoa_lai_luc timestamptz,
  UNIQUE (id, tai_khoan_id)
);

CREATE TABLE diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id),
  loai_cay_chon_id uuid NOT NULL REFERENCES plant_species (id),
  cay_nguoi_dung_id uuid,
  anh_id uuid NOT NULL UNIQUE,
  benh_du_doan_id uuid,
  huong_dan_id uuid,
  khoa_idempotency_bam text NOT NULL,
  request_bam text NOT NULL,
  trang_thai text NOT NULL DEFAULT 'queued',
  ket_qua text,
  do_tin_cay numeric,
  phien_ban_mo_hinh text,
  ma_loi text,
  tao_luc timestamptz NOT NULL DEFAULT now(),
  hoan_tat_luc timestamptz,
  UNIQUE (tai_khoan_id, khoa_idempotency_bam),
  FOREIGN KEY (cay_nguoi_dung_id, tai_khoan_id, loai_cay_chon_id)
    REFERENCES user_plants (id, tai_khoan_id, loai_cay_id) MATCH SIMPLE,
  FOREIGN KEY (anh_id, tai_khoan_id) REFERENCES images (id, tai_khoan_id),
  FOREIGN KEY (benh_du_doan_id, loai_cay_chon_id) REFERENCES diseases (id, loai_cay_id),
  FOREIGN KEY (huong_dan_id, benh_du_doan_id) REFERENCES disease_guides (id, benh_id),
  CONSTRAINT diagnoses_valid_status
    CHECK (trang_thai IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT diagnoses_valid_outcome CHECK (ket_qua IN ('disease', 'healthy', 'uncertain')),
  CONSTRAINT diagnoses_result_matches_status CHECK (
    (trang_thai = 'completed') = (ket_qua IS NOT NULL)
    AND (trang_thai = 'completed') = (do_tin_cay IS NOT NULL)
    AND (trang_thai = 'completed') = (phien_ban_mo_hinh IS NOT NULL)
  ),
  CONSTRAINT diagnoses_confidence_range CHECK (do_tin_cay BETWEEN 0 AND 1),
  CONSTRAINT diagnoses_disease_matches_outcome
    CHECK ((ket_qua IS NOT DISTINCT FROM 'disease') = (benh_du_doan_id IS NOT NULL)),
  CONSTRAINT diagnoses_guide_requires_disease CHECK (huong_dan_id IS NULL OR benh_du_doan_id IS NOT NULL),
  CONSTRAINT diagnoses_error_matches_status CHECK ((trang_thai = 'failed') = (ma_loi IS NOT NULL)),
  CONSTRAINT diagnoses_finish_time_matches_status
    CHECK ((trang_thai IN ('completed', 'failed')) = (hoan_tat_luc IS NOT NULL))
);

CREATE TABLE diagnosis_jobs (
  chan_doan_id uuid PRIMARY KEY REFERENCES diagnoses (id) ON DELETE CASCADE,
  so_lan_thu int NOT NULL DEFAULT 0 CHECK (so_lan_thu >= 0),
  kha_dung_luc timestamptz NOT NULL DEFAULT now(),
  het_han_thue_luc timestamptz,
  token_nhan uuid,
  CHECK ((token_nhan IS NULL) = (het_han_thue_luc IS NULL))
);

CREATE TABLE deleted_diagnosis_keys (
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  khoa_idempotency_bam text NOT NULL,
  het_han_luc timestamptz NOT NULL,
  PRIMARY KEY (tai_khoan_id, khoa_idempotency_bam)
);

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
  )
);

CREATE INDEX sessions_by_account ON sessions (tai_khoan_id);
CREATE INDEX sessions_by_expiry ON sessions (het_han_luc);
CREATE INDEX user_plants_by_account_archive ON user_plants (tai_khoan_id, luu_tru_luc, id);
CREATE INDEX care_logs_by_plant_time ON care_logs (cay_nguoi_dung_id, xay_ra_luc DESC, id DESC);
CREATE INDEX diagnoses_by_account_time ON diagnoses (tai_khoan_id, tao_luc DESC, id DESC);
CREATE INDEX diagnoses_by_plant_time ON diagnoses (cay_nguoi_dung_id, tao_luc DESC, id DESC);
CREATE INDEX diagnoses_active_by_account ON diagnoses (tai_khoan_id)
  WHERE trang_thai IN ('queued', 'processing');
CREATE INDEX diagnosis_jobs_by_available_time ON diagnosis_jobs (kha_dung_luc);
CREATE INDEX diagnosis_jobs_by_lease ON diagnosis_jobs (het_han_thue_luc)
  WHERE het_han_thue_luc IS NOT NULL;
CREATE INDEX images_pending_delete ON images (thu_xoa_lai_luc)
  WHERE trang_thai_luu_tru = 'pending_delete';
CREATE INDEX deleted_diagnosis_keys_by_expiry ON deleted_diagnosis_keys (het_han_luc);

INSERT INTO plant_species (ma, ten_vi) VALUES
  ('tomato', 'Cà chua'),
  ('cucumber', 'Dưa leo');

INSERT INTO diseases (loai_cay_id, ma, ten_vi)
SELECT plant_species.id, seed.ma, seed.ten_vi
FROM (VALUES
  ('tomato', 'early-blight', 'Đốm vòng'),
  ('tomato', 'late-blight', 'Mốc sương'),
  ('cucumber', 'downy-mildew', 'Sương mai'),
  ('cucumber', 'anthracnose', 'Thán thư')
) AS seed (species_code, ma, ten_vi)
JOIN plant_species ON plant_species.ma = seed.species_code;
