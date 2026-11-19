export const publicationJoins = `
  FROM community_plant_posts post
  JOIN user_plants plant ON plant.id = post.cay_nguoi_dung_id
  JOIN accounts owner ON owner.id = plant.tai_khoan_id
`;

export const published = `post.da_chia_se AND owner.yeu_cau_xoa_luc IS NULL
  AND NOT EXISTS (SELECT 1 FROM community_posts moderated
    WHERE moderated.legacy_plant_id = plant.id AND moderated.an_luc IS NOT NULL)`;
export const historyPublished = `${published} AND post.chia_se_nhat_ky
  AND EXISTS (SELECT 1 FROM community_posts consenting
    WHERE consenting.cay_nguoi_dung_id = plant.id AND consenting.chia_se_nhat_ky AND consenting.an_luc IS NULL)`;
