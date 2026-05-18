-- M21 Phase 1: RSVP-aware calendar filtering — additive columns only.
--
-- Applying this migration alone changes NOTHING user-visible. All three
-- columns default to "current behavior":
--
--   calendar_feed_configs.calendar_email   — the per-feed opt-in toggle.
--     NULL (default) = import every event regardless of RSVP (today's
--     behavior). Once the owner sets their address on the feed, Phase 2
--     keys the accepted-only filter off the ATTENDEE PARTSTAT for it.
--
--   calendar_feed_configs.last_sync_debug  — a sanitized, PII-free
--     RSVP-signal summary written on every sync and surfaced read-only in
--     Settings → Calendar. Phase 1 ships this FIRST so the owner can
--     confirm which signal an Outlook-published feed actually carries
--     before the Phase-2 filter logic is written against it.
--
--   calendar_feed_events.tentative         — false (default) = hard,
--     immovable, conflict-blocking (today's behavior for every row).
--     Phase 2 sets it true for tentatively-accepted events so the UI can
--     render them as a soft amber, non-blocking marker.

ALTER TABLE calendar_feed_configs
  ADD COLUMN IF NOT EXISTS calendar_email text;

ALTER TABLE calendar_feed_configs
  ADD COLUMN IF NOT EXISTS last_sync_debug text;

ALTER TABLE calendar_feed_events
  ADD COLUMN IF NOT EXISTS tentative boolean NOT NULL DEFAULT false;
