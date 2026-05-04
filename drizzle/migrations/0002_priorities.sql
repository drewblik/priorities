-- M4: priorities (Council of priority chatbots; read-only list at /priorities)
-- Apply this once via Neon's SQL editor.

CREATE TABLE IF NOT EXISTS priorities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon jsonb NOT NULL DEFAULT '{"color":"#3b82f6","style":"classic"}',
  smart_goal text,
  quarterly_strategy text,
  weekly_strategy text,
  daily_strategy text,
  min_minutes_per_week int NOT NULL DEFAULT 0,
  max_minutes_per_week int NOT NULL DEFAULT 0,
  check_in_cadence text[] NOT NULL DEFAULT '{quarterly,weekly,daily}',
  status text NOT NULL DEFAULT 'active',
  position int NOT NULL,
  pinned_summary text,
  sub_app_url text,
  sub_app_auth_token_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_priorities_user_position
  ON priorities (user_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_priorities_user_status
  ON priorities (user_id, status) WHERE deleted_at IS NULL;
