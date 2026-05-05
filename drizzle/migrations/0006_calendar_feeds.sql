-- M10: calendar_feed_configs + calendar_feed_events (read-only .ics ingestion).
-- configs are soft-deleted (deleted_at). events are HARD-deleted on cascade or
-- on future-cancellation, and `removed_from_source_at` flags past-events that
-- vanished upstream so they remain visible in retrospective views (TDD §725-768).

CREATE TABLE IF NOT EXISTS calendar_feed_configs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL,
  name text NOT NULL,
  feed_url text NOT NULL,
  sync_cadence_min int NOT NULL DEFAULT 30,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_calendar_configs_user
  ON calendar_feed_configs (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_configs_due
  ON calendar_feed_configs (last_synced_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS calendar_feed_events (
  id text PRIMARY KEY,
  source_feed_id text NOT NULL REFERENCES calendar_feed_configs(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  removed_from_source_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cfe_unique
  ON calendar_feed_events (source_feed_id, external_id);
CREATE INDEX IF NOT EXISTS idx_cfe_user_start
  ON calendar_feed_events (user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_cfe_user_active
  ON calendar_feed_events (user_id, start_time) WHERE removed_from_source_at IS NULL;
