import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  integer,
  numeric,
  time,
  jsonb,
  boolean,
  date,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// M2: auth tables
// =============================================================================

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    timezone: text('timezone').notNull().default('America/Los_Angeles'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('idx_users_email').on(table.email)],
);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_magic_link_tokens_email').on(table.email, table.expiresAt)],
);

// =============================================================================
// M3: user_settings (cost caps, planning preferences, encrypted Anthropic API key)
// =============================================================================

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  anthropicApiKey: text('anthropic_api_key'), // AES-GCM-encrypted envelope (base64); see src/lib/encryption.ts
  selectedModel: text('selected_model').notNull().default('claude-haiku-4-5-20251001'),
  dailyCostCapUsd: numeric('daily_cost_cap_usd', { precision: 10, scale: 2 })
    .notNull()
    .default('5.00'),
  monthlyCostCapUsd: numeric('monthly_cost_cap_usd', { precision: 10, scale: 2 })
    .notNull()
    .default('50.00'),
  planningDayOfWeek: integer('planning_day_of_week').notNull().default(0), // 0=Sunday
  eveningReviewTime: time('evening_review_time').notNull().default('20:00:00'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;

// =============================================================================
// M4: priorities (council of priorities, read-only list)
// =============================================================================

export type PriorityIcon = { color: string; style: string };

export const priorities = pgTable(
  'priorities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: jsonb('icon')
      .$type<PriorityIcon>()
      .notNull()
      .default({ color: '#3b82f6', style: 'classic' }),
    smartGoal: text('smart_goal'),
    quarterlyStrategy: text('quarterly_strategy'),
    weeklyStrategy: text('weekly_strategy'),
    dailyStrategy: text('daily_strategy'),
    minMinutesPerWeek: integer('min_minutes_per_week').notNull().default(0),
    maxMinutesPerWeek: integer('max_minutes_per_week').notNull().default(0),
    checkInCadence: text('check_in_cadence')
      .array()
      .notNull()
      .default(['quarterly', 'weekly', 'daily']),
    status: text('status').notNull().default('active'), // active|paused|archived
    position: integer('position').notNull(),
    pinnedSummary: text('pinned_summary'),
    subAppUrl: text('sub_app_url'),
    subAppAuthTokenEncrypted: text('sub_app_auth_token_encrypted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_priorities_user_position').on(table.userId, table.position),
    index('idx_priorities_user_status').on(table.userId, table.status),
  ],
);

export type Priority = typeof priorities.$inferSelect;

// =============================================================================
// M6: priority_memory + priority_files (Priority Detail page CRUD)
// =============================================================================

export const priorityMemory = pgTable(
  'priority_memory',
  {
    id: text('id').primaryKey(),
    priorityId: text('priority_id')
      .notNull()
      .references(() => priorities.id, { onDelete: 'cascade' }),
    body: text('body').notNull(), // markdown
    tags: text('tags').array().notNull().default([]),
    source: text('source').notNull().default('user'), // user|chatbot|onboarding|master_chat
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('idx_priority_memory_priority').on(table.priorityId, table.createdAt)],
);

export const priorityFiles = pgTable(
  'priority_files',
  {
    id: text('id').primaryKey(),
    priorityId: text('priority_id')
      .notNull()
      .references(() => priorities.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    blobUrl: text('blob_url').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('idx_priority_files_priority').on(table.priorityId)],
);

export type PriorityMemory = typeof priorityMemory.$inferSelect;
export type PriorityFile = typeof priorityFiles.$inferSelect;

// =============================================================================
// M7: quarters (council operates on 13-week quarters; ensureCurrentQuarter
// rolls users into a fresh quarter on first activity past the prior end_date)
// =============================================================================

export const quarters = pgTable(
  'quarters',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quarterLabel: text('quarter_label').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: text('status').notNull().default('active'), // active|closed
    isPartial: boolean('is_partial').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_quarters_user_active')
      .on(table.userId)
      .where(sql`${table.status} = 'active' AND ${table.deletedAt} IS NULL`),
    index('idx_quarters_user_dates').on(table.userId, table.startDate),
  ],
);

export type Quarter = typeof quarters.$inferSelect;

// =============================================================================
// M8: tasks + events (manual CRUD via Priority Detail; planning chatbots in
// M12+ write here too. Subsystem 12 recurrence engine: rows with recurrence!=null
// are templates; instances are computed at query time; per-instance edits create
// override rows via instance_of_*_id)
// =============================================================================

export type Recurrence = {
  type: 'daily' | 'weekly' | 'monthly';
  interval: number;
  byday?: ('MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU')[];
  bymonthday?: number;
  until?: string; // ISO date YYYY-MM-DD
};

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    ownerPriorityId: text('owner_priority_id')
      .notNull()
      .references(() => priorities.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    targetDate: date('target_date'),
    timeBlockStart: timestamp('time_block_start', { withTimezone: true }),
    timeBlockEnd: timestamp('time_block_end', { withTimezone: true }),
    recurrence: jsonb('recurrence').$type<Recurrence>(),
    instanceOfTaskId: text('instance_of_task_id').references((): AnyPgColumn => tasks.id, {
      onDelete: 'cascade',
    }),
    status: text('status').notNull().default('open'), // open|done|skipped
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_tasks_user_target')
      .on(table.userId, table.targetDate)
      .where(sql`${table.deletedAt} IS NULL AND ${table.status} = 'open'`),
    index('idx_tasks_priority_status')
      .on(table.ownerPriorityId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_tasks_time_block')
      .on(table.userId, table.timeBlockStart)
      .where(sql`${table.deletedAt} IS NULL AND ${table.timeBlockStart} IS NOT NULL`),
    index('idx_tasks_recurrence')
      .on(table.userId)
      .where(
        sql`${table.recurrence} IS NOT NULL AND ${table.instanceOfTaskId} IS NULL AND ${table.deletedAt} IS NULL`,
      ),
    index('idx_tasks_instance_of')
      .on(table.instanceOfTaskId, table.targetDate)
      .where(sql`${table.instanceOfTaskId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ],
);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    ownerPriorityId: text('owner_priority_id')
      .notNull()
      .references(() => priorities.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    recurrence: jsonb('recurrence').$type<Recurrence>(),
    instanceOfEventId: text('instance_of_event_id').references((): AnyPgColumn => events.id, {
      onDelete: 'cascade',
    }),
    completionStatus: text('completion_status'), // null|attended|missed
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_events_user_start')
      .on(table.userId, table.startTime)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_events_priority')
      .on(table.ownerPriorityId, table.startTime)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_events_recurrence')
      .on(table.userId)
      .where(
        sql`${table.recurrence} IS NOT NULL AND ${table.instanceOfEventId} IS NULL AND ${table.deletedAt} IS NULL`,
      ),
    index('idx_events_instance_of')
      .on(table.instanceOfEventId, table.startTime)
      .where(sql`${table.instanceOfEventId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type TaskInsert = typeof tasks.$inferInsert;
export type Event = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;

// =============================================================================
// M10: calendar_feed_configs + calendar_feed_events (read-only .ics ingestion)
//
// Configs: per-user feed subscriptions (encrypted feed_url at rest).
// Events: synced rows from each feed; HARD-deleted (no soft-delete column —
// TDD §72 reserves hard delete for purged-tables) and reconciled via
// `removed_from_source_at` for past-event preservation.
// =============================================================================

export const calendarFeedConfigs = pgTable(
  'calendar_feed_configs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // google|outlook|other
    name: text('name').notNull(),
    feedUrl: text('feed_url').notNull(), // AES-256-GCM-encrypted envelope (base64)
    syncCadenceMin: integer('sync_cadence_min').notNull().default(30),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_calendar_configs_user')
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_calendar_configs_due')
      .on(table.lastSyncedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const calendarFeedEvents = pgTable(
  'calendar_feed_events',
  {
    id: text('id').primaryKey(),
    sourceFeedId: text('source_feed_id')
      .notNull()
      .references(() => calendarFeedConfigs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    removedFromSourceAt: timestamp('removed_from_source_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_cfe_unique').on(table.sourceFeedId, table.externalId),
    index('idx_cfe_user_start').on(table.userId, table.startTime),
    index('idx_cfe_user_active')
      .on(table.userId, table.startTime)
      .where(sql`${table.removedFromSourceAt} IS NULL`),
  ],
);

export type CalendarFeedConfig = typeof calendarFeedConfigs.$inferSelect;
export type CalendarFeedEvent = typeof calendarFeedEvents.$inferSelect;

// =============================================================================
// M12: chat_sessions + generation_locks + quarter_week_focus
//
// chat_sessions: per-Priority planning conversation rows. Tracks cumulative
//   cost per session. session_type='quarter'|'weekly'|'daily'|'master'|...
//   priority_id is nullable (Master Chat sessions have no single priority).
//   chat_messages persistence is deferred to M16 — for M12, the message
//   thread is ephemeral / client-state.
//
// generation_locks: single-flight protection. PRIMARY KEY (user_id, lock_key).
//   Insert ON CONFLICT DO NOTHING; stale locks past expires_at get overwritten.
//
// quarter_week_focus: rows the Quarter Planning chatbot writes via the
//   set_week_focus tool. Unique on (quarter_id, priority_id, week_number).
// =============================================================================

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionType: text('session_type').notNull(), // onboarding|creation|quarter|weekly|daily|master
    contextRef: text('context_ref'), // quarter_id / week_start_date / day_date / new_priority_id
    priorityId: text('priority_id').references(() => priorities.id, { onDelete: 'set null' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 4 })
      .notNull()
      .default('0'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_chat_sessions_user_type')
      .on(table.userId, table.sessionType)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_chat_sessions_planning')
      .on(table.userId, table.sessionType, table.contextRef, table.priorityId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const generationLocks = pgTable(
  'generation_locks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lockKey: text('lock_key').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.lockKey] }),
    index('idx_generation_locks_expires').on(table.expiresAt),
  ],
);

export const quarterWeekFocus = pgTable(
  'quarter_week_focus',
  {
    id: text('id').primaryKey(),
    quarterId: text('quarter_id')
      .notNull()
      .references(() => quarters.id, { onDelete: 'cascade' }),
    priorityId: text('priority_id')
      .notNull()
      .references(() => priorities.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    focusLabel: text('focus_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_qwf_unique').on(table.quarterId, table.priorityId, table.weekNumber),
    index('idx_qwf_quarter_week').on(table.quarterId, table.weekNumber),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user|assistant|tool_result
    /**
     * Anthropic-shape content. For role='user' or 'assistant', this is a
     * `ContentBlock[]` (possibly with tool_use blocks). For role='tool_result',
     * it's a `ToolResultBlockParam[]` we inject back into the conversation
     * after server-side tool execution.
     */
    content: jsonb('content').notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
    isComplete: boolean('is_complete').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_chat_messages_session').on(table.sessionId, table.createdAt)],
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type GenerationLock = typeof generationLocks.$inferSelect;
export type QuarterWeekFocus = typeof quarterWeekFocus.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
