import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  integer,
  numeric,
  time,
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
