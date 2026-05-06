-- M12: chat_sessions + generation_locks + quarter_week_focus
-- First AI feature lands here. chat_messages persistence deferred to M16
-- (Master Chat) — quarter-planning sessions are ephemeral; message thread
-- lives in client-state during a turn.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_type text NOT NULL,
  context_ref text,
  priority_id text REFERENCES priorities(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  total_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_type
  ON chat_sessions (user_id, session_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_planning
  ON chat_sessions (user_id, session_type, context_ref, priority_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS generation_locks (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lock_key text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, lock_key)
);

CREATE INDEX IF NOT EXISTS idx_generation_locks_expires ON generation_locks (expires_at);

CREATE TABLE IF NOT EXISTS quarter_week_focus (
  id text PRIMARY KEY,
  quarter_id text NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  week_number int NOT NULL,
  focus_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qwf_unique
  ON quarter_week_focus (quarter_id, priority_id, week_number);
CREATE INDEX IF NOT EXISTS idx_qwf_quarter_week
  ON quarter_week_focus (quarter_id, week_number);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content jsonb NOT NULL,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  is_complete boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages (session_id, created_at);
