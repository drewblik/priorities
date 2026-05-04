-- M6: priority_memory + priority_files (Priority Detail page memory + file uploads)
-- Apply this once via Neon's SQL editor.

CREATE TABLE IF NOT EXISTS priority_memory (
  id text PRIMARY KEY,
  priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_priority_memory_priority
  ON priority_memory (priority_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS priority_files (
  id text PRIMARY KEY,
  priority_id text NOT NULL REFERENCES priorities(id) ON DELETE CASCADE,
  filename text NOT NULL,
  blob_url text NOT NULL,
  mime_type text NOT NULL,
  size_bytes int NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_priority_files_priority
  ON priority_files (priority_id) WHERE deleted_at IS NULL;
