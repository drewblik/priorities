-- M3: user_settings (cost caps, planning preferences, encrypted Anthropic API key)
-- Apply this once via Neon's SQL editor.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  anthropic_api_key text,                       -- AES-GCM-encrypted envelope (base64); never plaintext
  daily_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 5.00,
  monthly_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 50.00,
  planning_day_of_week int NOT NULL DEFAULT 0,  -- 0=Sunday
  evening_review_time time NOT NULL DEFAULT '20:00:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);
