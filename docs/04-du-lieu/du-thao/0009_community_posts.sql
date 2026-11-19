ALTER TABLE community_plant_posts ADD COLUMN legacy_feed boolean NOT NULL DEFAULT true;

CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cay_nguoi_dung_id uuid NOT NULL,
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  legacy_plant_id uuid UNIQUE REFERENCES community_plant_posts (cay_nguoi_dung_id) ON DELETE CASCADE,
  thu_tu bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tieu_de text NOT NULL CHECK (char_length(btrim(tieu_de)) BETWEEN 1 AND 120),
  noi_dung text NOT NULL DEFAULT '' CHECK (char_length(noi_dung) <= 4000),
  chia_se_nhat_ky boolean NOT NULL DEFAULT false,
  xay_ra_luc timestamptz NOT NULL DEFAULT now(),
  tao_luc timestamptz NOT NULL DEFAULT now(),
  cap_nhat_luc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tai_khoan_id),
  FOREIGN KEY (cay_nguoi_dung_id, tai_khoan_id) REFERENCES user_plants (id, tai_khoan_id) ON DELETE CASCADE,
  CHECK (legacy_plant_id IS NULL OR (legacy_plant_id = id AND legacy_plant_id = cay_nguoi_dung_id))
);

CREATE TABLE community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  parent_id uuid,
  thu_tu bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  noi_dung text NOT NULL DEFAULT '' CHECK (char_length(noi_dung) <= 1000),
  tao_luc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, post_id),
  UNIQUE (id, tai_khoan_id),
  FOREIGN KEY (parent_id, post_id) REFERENCES community_post_comments (id, post_id) ON DELETE CASCADE,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE community_post_reactions (
  post_id uuid NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('heart', 'cry', 'laugh')),
  PRIMARY KEY (post_id, tai_khoan_id)
);

CREATE TABLE community_comment_likes (
  comment_id uuid NOT NULL REFERENCES community_post_comments (id) ON DELETE CASCADE,
  tai_khoan_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, tai_khoan_id)
);

CREATE TABLE community_post_photos (
  post_id uuid NOT NULL,
  tai_khoan_id uuid NOT NULL,
  anh_id uuid NOT NULL UNIQUE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  PRIMARY KEY (post_id, position),
  FOREIGN KEY (post_id, tai_khoan_id) REFERENCES community_posts (id, tai_khoan_id) ON DELETE CASCADE,
  FOREIGN KEY (anh_id, tai_khoan_id) REFERENCES images (id, tai_khoan_id)
);

CREATE TABLE community_comment_photos (
  comment_id uuid NOT NULL,
  tai_khoan_id uuid NOT NULL,
  anh_id uuid NOT NULL UNIQUE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  PRIMARY KEY (comment_id, position),
  FOREIGN KEY (comment_id, tai_khoan_id) REFERENCES community_post_comments (id, tai_khoan_id) ON DELETE CASCADE,
  FOREIGN KEY (anh_id, tai_khoan_id) REFERENCES images (id, tai_khoan_id)
);

INSERT INTO community_posts (id, cay_nguoi_dung_id, tai_khoan_id, legacy_plant_id,
  tieu_de, noi_dung, chia_se_nhat_ky, xay_ra_luc, tao_luc, cap_nhat_luc)
SELECT post.cay_nguoi_dung_id, post.cay_nguoi_dung_id, plant.tai_khoan_id, post.cay_nguoi_dung_id,
  post.tieu_de, COALESCE(post.gioi_thieu, ''), post.chia_se_nhat_ky, post.tao_luc, post.tao_luc, post.tao_luc
FROM community_plant_posts post JOIN user_plants plant ON plant.id = post.cay_nguoi_dung_id
ORDER BY post.thu_tu;

INSERT INTO community_post_comments (id, post_id, tai_khoan_id, noi_dung, tao_luc)
SELECT id, cay_nguoi_dung_id, tac_gia_id, noi_dung, tao_luc FROM community_comments ORDER BY thu_tu;

CREATE FUNCTION sync_legacy_community_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.legacy_feed THEN
    INSERT INTO community_posts (id, cay_nguoi_dung_id, tai_khoan_id, legacy_plant_id,
      tieu_de, noi_dung, chia_se_nhat_ky, xay_ra_luc, tao_luc)
    SELECT NEW.cay_nguoi_dung_id, NEW.cay_nguoi_dung_id, plant.tai_khoan_id, NEW.cay_nguoi_dung_id,
      NEW.tieu_de, COALESCE(NEW.gioi_thieu, ''), NEW.chia_se_nhat_ky, NEW.tao_luc, NEW.tao_luc
    FROM user_plants plant WHERE plant.id = NEW.cay_nguoi_dung_id
    ON CONFLICT (legacy_plant_id) DO UPDATE
      SET tieu_de = EXCLUDED.tieu_de, noi_dung = EXCLUDED.noi_dung,
        chia_se_nhat_ky = EXCLUDED.chia_se_nhat_ky, cap_nhat_luc = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_share_syncs_legacy_feed
AFTER INSERT OR UPDATE ON community_plant_posts
FOR EACH ROW EXECUTE FUNCTION sync_legacy_community_post();

CREATE FUNCTION retire_removed_community_photo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE images image SET trang_thai_luu_tru = 'pending_delete', thu_xoa_lai_luc = clock_timestamp()
  WHERE image.id = OLD.anh_id
    AND NOT EXISTS (SELECT 1 FROM community_post_photos photo WHERE photo.anh_id = image.id)
    AND NOT EXISTS (SELECT 1 FROM community_comment_photos photo WHERE photo.anh_id = image.id)
    AND NOT EXISTS (SELECT 1 FROM diagnoses scan WHERE scan.anh_id = image.id)
    AND NOT EXISTS (SELECT 1 FROM care_log_photos photo WHERE photo.anh_id = image.id)
    AND NOT EXISTS (SELECT 1 FROM account_profiles profile WHERE profile.anh_id = image.id);
  RETURN OLD;
END;
$$;

CREATE TRIGGER community_post_photo_removed AFTER DELETE ON community_post_photos
FOR EACH ROW EXECUTE FUNCTION retire_removed_community_photo();
CREATE TRIGGER community_comment_photo_removed AFTER DELETE ON community_comment_photos
FOR EACH ROW EXECUTE FUNCTION retire_removed_community_photo();

CREATE INDEX community_posts_by_plant ON community_posts (cay_nguoi_dung_id, thu_tu DESC);
CREATE INDEX community_posts_by_owner ON community_posts (tai_khoan_id, thu_tu DESC);
CREATE INDEX community_comments_by_parent ON community_post_comments (post_id, parent_id, thu_tu DESC);
CREATE INDEX community_post_comments_by_owner ON community_post_comments (tai_khoan_id);
