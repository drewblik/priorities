import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { userSettings, users, type UserSettings } from '@/db/schema';
import { DEFAULT_MODEL_ID, type AnthropicModelId } from './anthropic-models';
import { decryptApiKey, encryptApiKey } from './encryption';

export type SettingsPatch = {
  name?: string | null;
  timezone?: string;
  anthropicApiKey?: string | null;
  selectedModel?: AnthropicModelId;
  dailyCostCapUsd?: number;
  monthlyCostCapUsd?: number;
  planningDayOfWeek?: number;
  eveningReviewTime?: string;
};

export type SettingsView = {
  email: string;
  name: string | null;
  timezone: string;
  hasApiKey: boolean;
  selectedModel: AnthropicModelId;
  dailyCostCapUsd: string;
  monthlyCostCapUsd: string;
  planningDayOfWeek: number;
  eveningReviewTime: string;
  updatedAt: Date | null;
};

const DEFAULTS = {
  selectedModel: DEFAULT_MODEL_ID,
  dailyCostCapUsd: '5.00',
  monthlyCostCapUsd: '50.00',
  planningDayOfWeek: 0,
  eveningReviewTime: '20:00:00',
} as const;

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSettingsView(userId: string): Promise<SettingsView | null> {
  const rows = await db
    .select({
      email: users.email,
      name: users.name,
      timezone: users.timezone,
      anthropicApiKey: userSettings.anthropicApiKey,
      selectedModel: userSettings.selectedModel,
      dailyCostCapUsd: userSettings.dailyCostCapUsd,
      monthlyCostCapUsd: userSettings.monthlyCostCapUsd,
      planningDayOfWeek: userSettings.planningDayOfWeek,
      eveningReviewTime: userSettings.eveningReviewTime,
      updatedAt: userSettings.updatedAt,
    })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    hasApiKey: row.anthropicApiKey !== null && row.anthropicApiKey !== undefined,
    selectedModel: (row.selectedModel ?? DEFAULTS.selectedModel) as AnthropicModelId,
    dailyCostCapUsd: row.dailyCostCapUsd ?? DEFAULTS.dailyCostCapUsd,
    monthlyCostCapUsd: row.monthlyCostCapUsd ?? DEFAULTS.monthlyCostCapUsd,
    planningDayOfWeek: row.planningDayOfWeek ?? DEFAULTS.planningDayOfWeek,
    eveningReviewTime: row.eveningReviewTime ?? DEFAULTS.eveningReviewTime,
    updatedAt: row.updatedAt,
  };
}

export async function getDecryptedAnthropicKey(userId: string): Promise<string | null> {
  const row = await getUserSettings(userId);
  if (!row?.anthropicApiKey) return null;
  return decryptApiKey(row.anthropicApiKey);
}

export async function applySettingsPatch(userId: string, patch: SettingsPatch): Promise<void> {
  const userUpdate: Partial<{ name: string | null; timezone: string; updatedAt: Date }> = {};
  if (patch.name !== undefined) userUpdate.name = patch.name;
  if (patch.timezone !== undefined) userUpdate.timezone = patch.timezone;
  if (Object.keys(userUpdate).length > 0) {
    userUpdate.updatedAt = new Date();
    await db.update(users).set(userUpdate).where(eq(users.id, userId));
  }

  const settingsUpdate: Record<string, unknown> = {};
  if (patch.anthropicApiKey !== undefined) {
    settingsUpdate.anthropicApiKey =
      patch.anthropicApiKey === null ? null : encryptApiKey(patch.anthropicApiKey);
  }
  if (patch.selectedModel !== undefined) {
    settingsUpdate.selectedModel = patch.selectedModel;
  }
  if (patch.dailyCostCapUsd !== undefined) {
    settingsUpdate.dailyCostCapUsd = patch.dailyCostCapUsd.toFixed(2);
  }
  if (patch.monthlyCostCapUsd !== undefined) {
    settingsUpdate.monthlyCostCapUsd = patch.monthlyCostCapUsd.toFixed(2);
  }
  if (patch.planningDayOfWeek !== undefined) {
    settingsUpdate.planningDayOfWeek = patch.planningDayOfWeek;
  }
  if (patch.eveningReviewTime !== undefined) {
    settingsUpdate.eveningReviewTime = patch.eveningReviewTime;
  }

  if (Object.keys(settingsUpdate).length === 0) return;

  settingsUpdate.updatedAt = sql`now()`;
  await db
    .insert(userSettings)
    .values({ userId, ...settingsUpdate })
    .onConflictDoUpdate({ target: userSettings.userId, set: settingsUpdate });
}
