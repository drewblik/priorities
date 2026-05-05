-- M7: quarters (council operates on 13-week quarters; ensureCurrentQuarter
-- rolls users into a fresh quarter on first activity past the prior end_date)
-- Apply this once via Neon's SQL editor.

CREATE TABLE IF NOT EXISTS quarters (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quarter_label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_partial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quarters_user_active
  ON quarters (user_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quarters_user_dates
  ON quarters (user_id, start_date) WHERE deleted_at IS NULL;
