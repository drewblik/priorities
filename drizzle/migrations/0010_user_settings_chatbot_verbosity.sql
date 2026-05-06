-- M13: chatbot verbosity control. Maps to per-call max_tokens at chat-route
-- construction time. Respects "verbatim prompts" rule by not modifying any
-- prompt text — only the response budget changes. Applies to M12 quarter chat
-- + M13 weekly chat (and M14/M16/M18 reuse the same column).
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS chatbot_verbosity text NOT NULL DEFAULT 'balanced';
