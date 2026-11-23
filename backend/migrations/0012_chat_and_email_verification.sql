CREATE TABLE chat_turns (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tai_khoan_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_digest text NOT NULL,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 600),
  answer jsonb NOT NULL,
  diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL,
  UNIQUE (tai_khoan_id, request_id)
);

CREATE INDEX chat_turns_recent ON chat_turns (tai_khoan_id, sequence DESC);

ALTER TABLE accounts ADD COLUMN email_xac_minh_luc timestamptz;

CREATE TABLE email_verification_codes (
  tai_khoan_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  email text NOT NULL,
  code_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
