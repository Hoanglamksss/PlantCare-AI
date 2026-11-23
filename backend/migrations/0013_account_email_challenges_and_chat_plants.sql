CREATE TABLE account_email_challenges (
  id uuid PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('register', 'change')),
  subject text NOT NULL,
  email text NOT NULL,
  code_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  UNIQUE (purpose, subject, email)
);

CREATE INDEX account_email_challenges_expiry ON account_email_challenges (expires_at);

ALTER TABLE chat_turns ADD COLUMN plant_id uuid REFERENCES user_plants(id) ON DELETE SET NULL;
