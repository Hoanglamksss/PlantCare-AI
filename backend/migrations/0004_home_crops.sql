INSERT INTO plant_species (ma, ten_vi) VALUES
  ('chili', 'Ớt'),
  ('basil', 'Húng quế'),
  ('mint', 'Bạc hà')
ON CONFLICT (ma) DO NOTHING;
