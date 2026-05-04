// Drizzle schema. Tables are populated as build milestones land:
//   M2:  users, sessions, magic_link_tokens
//   M3:  user_settings
//   M4:  priorities
//   M6:  priority_memory, priority_files
//   M7:  quarters, quarter_week_focus
//   M8:  tasks, events
//   M10: calendar_feed_configs, calendar_feed_events
//   M12: chat_sessions, chat_messages, generation_locks
//
// All user-content tables include `deleted_at timestamptz`. All IDs are text PKs
// in the form `<prefix>_<nanoid(16)>` (see src/lib/id.ts).

export {};
