-- M10 hotfix: track whether a calendar_feed_events row is an all-day event
-- (DTSTART;VALUE=DATE in ICS). Without this, all-day events are stored at
-- midnight UTC of the calendar date and end up on the previous day for
-- users west of UTC because the user-TZ bucket query catches the midnight-UTC
-- timestamp inside the prior day's TZ window. With the flag, the read query
-- can match all-day rows by start_time::date directly instead of by TZ bounds.
-- Default false — backfill happens naturally on the next sync (the upsert
-- by (source_feed_id, external_id) overwrites all_day to the correct value).

ALTER TABLE calendar_feed_events
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;
