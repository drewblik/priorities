-- M11 follow-up: per-user model selection. Default Haiku 4.5 for cheap
-- testing; user can switch to Sonnet / Opus in Settings → API Key for real
-- planning sessions. M12+ chatbot calls read this column when constructing
-- the Anthropic SDK message.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS selected_model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001';
