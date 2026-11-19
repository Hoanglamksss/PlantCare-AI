CREATE TABLE community_plant_posts (
  cay_nguoi_dung_id uuid PRIMARY KEY REFERENCES user_plants (id) ON DELETE CASCADE,
  thu_tu bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tieu_de text NOT NULL CHECK (char_length(btrim(tieu_de)) BETWEEN 1 AND 80),
  gioi_thieu text CHECK (char_length(gioi_thieu) <= 1000),
  da_chia_se boolean NOT NULL DEFAULT true,
  tao_luc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cay_nguoi_dung_id uuid NOT NULL REFERENCES community_plant_posts (cay_nguoi_dung_id) ON DELETE CASCADE,
  tac_gia_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  thu_tu bigint GENERATED ALWAYS AS IDENTITY,
  noi_dung text NOT NULL CHECK (char_length(btrim(noi_dung)) BETWEEN 1 AND 500),
  tao_luc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cay_nguoi_dung_id, thu_tu)
);

CREATE INDEX community_posts_published_order ON community_plant_posts (thu_tu DESC) WHERE da_chia_se;
CREATE INDEX community_comments_by_author ON community_comments (tac_gia_id);

CREATE FUNCTION hide_archived_community_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE community_plant_posts SET da_chia_se = false
  WHERE cay_nguoi_dung_id = NEW.id AND da_chia_se;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_plant_archive_hides_community_post
AFTER UPDATE OF luu_tru_luc ON user_plants
FOR EACH ROW WHEN (OLD.luu_tru_luc IS NULL AND NEW.luu_tru_luc IS NOT NULL)
EXECUTE FUNCTION hide_archived_community_post();
