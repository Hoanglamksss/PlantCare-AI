ALTER TABLE care_logs
  ADD CONSTRAINT care_logs_gallery_owner_unique UNIQUE (id, tai_khoan_id, la_ghi_chu),
  ADD CONSTRAINT care_logs_note_is_observation CHECK (NOT la_ghi_chu OR hoat_dong = 'observation');

CREATE TABLE care_log_photos (
  care_log_id uuid NOT NULL,
  tai_khoan_id uuid NOT NULL,
  anh_id uuid NOT NULL UNIQUE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  la_ghi_chu boolean GENERATED ALWAYS AS (true) STORED,
  PRIMARY KEY (care_log_id, position),
  FOREIGN KEY (care_log_id, tai_khoan_id, la_ghi_chu)
    REFERENCES care_logs (id, tai_khoan_id, la_ghi_chu) ON DELETE CASCADE,
  FOREIGN KEY (anh_id, tai_khoan_id) REFERENCES images (id, tai_khoan_id)
);

INSERT INTO care_log_photos (care_log_id, tai_khoan_id, anh_id, position)
SELECT id, tai_khoan_id, anh_id, 0 FROM care_logs WHERE anh_id IS NOT NULL;

ALTER TABLE care_logs
  DROP CONSTRAINT care_logs_note_has_content,
  DROP COLUMN anh_id;
