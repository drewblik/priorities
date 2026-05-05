-- M8: tasks + events (manual CRUD via Priority Detail in M8; planning
-- chatbots in M12+ write here too). Subsystem 12 recurrence engine: rows
-- with recurrence!=NULL are templates; instances computed at query time;
-- per-instance edits create override rows via instance_of_*_id self-FK.
-- Apply this once via Neon's SQL editor.

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  owner_priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,
  time_block_start timestamptz,
  time_block_end timestamptz,
  recurrence jsonb,
  instance_of_task_id text REFERENCES tasks(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_target
  ON tasks (user_id, target_date) WHERE deleted_at IS NULL AND status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_priority_status
  ON tasks (owner_priority_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_time_block
  ON tasks (user_id, time_block_start) WHERE deleted_at IS NULL AND time_block_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence
  ON tasks (user_id) WHERE recurrence IS NOT NULL AND instance_of_task_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_instance_of
  ON tasks (instance_of_task_id, target_date) WHERE instance_of_task_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  owner_priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  recurrence jsonb,
  instance_of_event_id text REFERENCES events(id) ON DELETE CASCADE,
  completion_status text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_events_user_start
  ON events (user_id, start_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_priority
  ON events (owner_priority_id, start_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_recurrence
  ON events (user_id) WHERE recurrence IS NOT NULL AND instance_of_event_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_instance_of
  ON events (instance_of_event_id, start_time) WHERE instance_of_event_id IS NOT NULL AND deleted_at IS NULL;
