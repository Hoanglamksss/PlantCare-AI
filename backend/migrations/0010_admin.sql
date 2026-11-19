ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_check;

ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_check CHECK (
  (loai_doi_tuong = 'species' AND hanh_dong IN ('create_species', 'update_species'))
  OR (loai_doi_tuong = 'disease' AND hanh_dong IN ('create_disease', 'update_disease'))
  OR (loai_doi_tuong = 'guide' AND hanh_dong IN ('create_guide', 'publish_guide', 'archive_guide'))
  OR (loai_doi_tuong = 'account' AND hanh_dong IN ('deactivate_account', 'activate_account', 'grant_admin'))
  OR (loai_doi_tuong = 'post' AND hanh_dong IN ('hide_post', 'unhide_post'))
);

CREATE INDEX admin_audit_logs_by_time ON admin_audit_logs (xay_ra_luc DESC);
