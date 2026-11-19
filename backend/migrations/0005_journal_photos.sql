ALTER TABLE user_plants
  ADD CONSTRAINT user_plants_id_account_unique UNIQUE (id, tai_khoan_id);

ALTER TABLE care_logs
  ADD COLUMN tai_khoan_id uuid,
  ADD COLUMN la_ghi_chu boolean NOT NULL DEFAULT false,
  ADD COLUMN anh_id uuid;

UPDATE care_logs AS log
SET tai_khoan_id = plant.tai_khoan_id
FROM user_plants AS plant
WHERE plant.id = log.cay_nguoi_dung_id;

ALTER TABLE care_logs
  ALTER COLUMN tai_khoan_id SET NOT NULL,
  DROP CONSTRAINT care_logs_cay_nguoi_dung_id_fkey,
  ADD CONSTRAINT care_logs_plant_owner_fk FOREIGN KEY (cay_nguoi_dung_id, tai_khoan_id)
    REFERENCES user_plants (id, tai_khoan_id) ON DELETE CASCADE,
  ADD CONSTRAINT care_logs_photo_owner_fk FOREIGN KEY (anh_id, tai_khoan_id)
    REFERENCES images (id, tai_khoan_id),
  ADD CONSTRAINT care_logs_photo_unique UNIQUE (anh_id),
  ADD CONSTRAINT care_logs_photo_requires_note CHECK (anh_id IS NULL OR la_ghi_chu),
  ADD CONSTRAINT care_logs_note_has_content CHECK (
    NOT la_ghi_chu OR (
      hoat_dong = 'observation'
      AND (NULLIF(btrim(ghi_chu), '') IS NOT NULL OR anh_id IS NOT NULL)
    )
  );
