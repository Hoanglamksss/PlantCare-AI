CREATE TABLE account_profiles (
  tai_khoan_id uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  ten_hien_thi text CHECK (char_length(ten_hien_thi) BETWEEN 1 AND 80 AND btrim(ten_hien_thi) <> ''),
  so_dien_thoai text CHECK (so_dien_thoai ~ '^[+][1-9][0-9]{7,14}$'),
  anh_id uuid UNIQUE,
  FOREIGN KEY (anh_id, tai_khoan_id) REFERENCES images (id, tai_khoan_id)
);
