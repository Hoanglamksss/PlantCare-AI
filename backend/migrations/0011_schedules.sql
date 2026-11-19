CREATE TABLE care_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  cay_nguoi_dung_id uuid NOT NULL,
  client_id uuid,
  hoat_dong text NOT NULL CHECK (hoat_dong IN ('watering', 'fertilizing', 'observation', 'pruning', 'repotting', 'custom')),
  tieu_de text NOT NULL CHECK (char_length(btrim(tieu_de)) BETWEEN 1 AND 120),
  ngay_bat_dau date NOT NULL,
  gio_hen time NOT NULL,
  mui_gio text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (mui_gio = 'Asia/Ho_Chi_Minh'),
  loai_lap text NOT NULL CHECK (loai_lap IN ('once', 'daily', 'weekly', 'monthly')),
  khoang_lap int NOT NULL CHECK (khoang_lap BETWEEN 1 AND 365),
  dang_bat boolean NOT NULL DEFAULT true,
  den_han_luc timestamptz,
  xoa_luc timestamptz,
  tao_luc timestamptz NOT NULL DEFAULT now(),
  cap_nhat_luc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tai_khoan_id, client_id),
  UNIQUE (id, tai_khoan_id),
  FOREIGN KEY (cay_nguoi_dung_id, tai_khoan_id) REFERENCES user_plants (id, tai_khoan_id),
  CHECK (dang_bat = (den_han_luc IS NOT NULL)),
  CHECK (xoa_luc IS NULL OR NOT dang_bat)
);

CREATE INDEX care_schedules_by_account ON care_schedules (tai_khoan_id, id) WHERE xoa_luc IS NULL;
CREATE INDEX care_schedules_due ON care_schedules (den_han_luc) WHERE dang_bat AND xoa_luc IS NULL;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thu_tu bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  cay_nguoi_dung_id uuid NOT NULL,
  lich_id uuid NOT NULL,
  hen_luc timestamptz NOT NULL,
  tieu_de text NOT NULL,
  noi_dung text NOT NULL,
  tao_luc timestamptz NOT NULL DEFAULT now(),
  doc_luc timestamptz,
  UNIQUE (lich_id, hen_luc),
  FOREIGN KEY (lich_id, tai_khoan_id) REFERENCES care_schedules (id, tai_khoan_id),
  FOREIGN KEY (cay_nguoi_dung_id, tai_khoan_id) REFERENCES user_plants (id, tai_khoan_id)
);

CREATE INDEX notifications_by_account_time ON notifications (tai_khoan_id, thu_tu DESC);
CREATE INDEX notifications_unread ON notifications (tai_khoan_id) WHERE doc_luc IS NULL;
