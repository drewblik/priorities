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
} from 'drizzle-orm/pg-core';

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
