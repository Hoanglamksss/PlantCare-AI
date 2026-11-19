ALTER TABLE diagnoses ADD COLUMN ket_qua_sang_loc jsonb;

ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_screening_requires_completed CHECK (
  ket_qua_sang_loc IS NULL OR (trang_thai = 'completed' AND jsonb_typeof(ket_qua_sang_loc) = 'object')
);
