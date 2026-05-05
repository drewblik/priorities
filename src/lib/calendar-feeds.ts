import { addDays, format, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  calendarFeedConfigs,
  calendarFeedEvents,
  type CalendarFeedConfig,
  type CalendarFeedEvent,
} from '@/db/schema';
import { decryptApiKey, encryptApiKey } from '@/lib/encryption';
import { newId } from '@/lib/id';

/**
 * View shape for the Settings → Calendar tab and any other UI surface that
 * shouldn't see the encrypted feed URL. `feedUrl` is replaced with a
 * masked indicator + a `hasFeedUrl` boolean.
 */
export type CalendarFeedConfigView = Omit<CalendarFeedConfig, 'feedUrl'> & {
  feedUrlPreview: string;
};

function viewOf(config: CalendarFeedConfig): CalendarFeedConfigView {
  let preview = '••• (encrypted)';
  try {
    const url = decryptApiKey(config.feedUrl);
    // Show only the host so the secret-token query string stays hidden.
    const host = new URL(url).host;
    preview = host;
  } catch {
    // Decryption failure (envelope corrupted, key rotated, etc.) — leave masked.
  }
  const { feedUrl: _omit, ...rest } = config;
  void _omit;
  return { ...rest, feedUrlPreview: preview };
}

export async function getFeedsForUser(userId: string): Promise<CalendarFeedConfigView[]> {
  const rows = await db
    .select()
    .from(calendarFeedConfigs)
    .where(and(eq(calendarFeedConfigs.userId, userId), isNull(calendarFeedConfigs.deletedAt)))
    .orderBy(asc(calendarFeedConfigs.createdAt));
  return rows.map(viewOf);
}

/** Internal: returns the row with the encrypted feed_url intact. Used by the
 *  sync engine and by the API route's "verify ownership" check. Never expose
 *  to the UI. */
export async function getFeedByIdInternal(
  userId: string,
  id: string,
): Promise<CalendarFeedConfig | null> {
  const rows = await db
    .select()
    .from(calendarFeedConfigs)
    .where(
      and(
        eq(calendarFeedConfigs.id, id),
        eq(calendarFeedConfigs.userId, userId),
        isNull(calendarFeedConfigs.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Resolves the feed_url plaintext from the encrypted column. Throws on
 *  decryption failure. */
export function decryptFeedUrl(config: CalendarFeedConfig): string {
  return decryptApiKey(config.feedUrl);
}

export type CreateCalendarFeedInput = {
  name: string;
  source: 'google' | 'outlook' | 'other';
  feedUrl: string; // plaintext; encrypted before write
  syncCadenceMin?: number;
};

export async function createFeed(
  userId: string,
  input: CreateCalendarFeedInput,
): Promise<CalendarFeedConfig | null> {
  const [row] = await db
    .insert(calendarFeedConfigs)
    .values({
      id: newId('cfc'),
      userId,
      source: input.source,
      name: input.name,
      feedUrl: encryptApiKey(input.feedUrl),
      syncCadenceMin: input.syncCadenceMin ?? 30,
    })
    .returning();
  return row ?? null;
}

export type UpdateCalendarFeedPatch = {
  name?: string;
  source?: 'google' | 'outlook' | 'other';
  feedUrl?: string; // plaintext; encrypted before write
  syncCadenceMin?: number;
};

export async function updateFeed(
  userId: string,
  id: string,
  patch: UpdateCalendarFeedPatch,
): Promise<CalendarFeedConfig | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.source !== undefined) set.source = patch.source;
  if (patch.feedUrl !== undefined) set.feedUrl = encryptApiKey(patch.feedUrl);
  if (patch.syncCadenceMin !== undefined) set.syncCadenceMin = patch.syncCadenceMin;
  if (Object.keys(set).length === 1) return getFeedByIdInternal(userId, id);

  const [row] = await db
    .update(calendarFeedConfigs)
    .set(set)
    .where(
      and(
        eq(calendarFeedConfigs.id, id),
        eq(calendarFeedConfigs.userId, userId),
        isNull(calendarFeedConfigs.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes the feed config AND hard-deletes its events. The events table
 * has no `deleted_at` column (TDD §72) and there's no value in keeping rows
 * once their feed is gone.
 */
export async function softDeleteFeed(userId: string, id: string): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(calendarFeedConfigs)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(calendarFeedConfigs.id, id),
        eq(calendarFeedConfigs.userId, userId),
        isNull(calendarFeedConfigs.deletedAt),
      ),
    )
    .returning({ id: calendarFeedConfigs.id });
  if (updated.length === 0) return false;

  await db.delete(calendarFeedEvents).where(eq(calendarFeedEvents.sourceFeedId, id));
  return true;
}

/** Sets sync_cadence_min/last_synced_at/last_sync_error in the same UPDATE.
 *  Used by the sync engine after each fetch attempt. */
export async function recordFeedSyncResult(
  configId: string,
  result: { success: boolean; error?: string | null; at?: Date },
): Promise<void> {
  const at = result.at ?? new Date();
  await db
    .update(calendarFeedConfigs)
    .set({
      lastSyncedAt: at,
      lastSyncError: result.success ? null : (result.error ?? 'unknown error'),
      updatedAt: at,
    })
    .where(eq(calendarFeedConfigs.id, configId));
}

/**
 * User-TZ-bounded read for Daily View. Returns active (not removed) feed
 * events whose start_time falls on any calendar date in [startISO, endISO]
 * interpreted in the user's timezone — same fromZonedTime pattern as the
 * M9 hotfix in events.ts so a "May 4 10:32 PM PT" event renders on May 4.
 */
export async function getCalendarFeedEventsForRange(
  userId: string,
  startISO: string,
  endISO: string,
  userTimezone: string,
): Promise<CalendarFeedEvent[]> {
  const startUtc = fromZonedTime(`${startISO}T00:00:00`, userTimezone);
  const endUtc = fromZonedTime(`${endISO}T23:59:59.999`, userTimezone);
  return db
    .select()
    .from(calendarFeedEvents)
    .where(
      and(
        eq(calendarFeedEvents.userId, userId),
        gte(calendarFeedEvents.startTime, startUtc),
        lte(calendarFeedEvents.startTime, endUtc),
        isNull(calendarFeedEvents.removedFromSourceAt),
      ),
    )
    .orderBy(asc(calendarFeedEvents.startTime));
}

/**
 * Walks calendar-date strings between [startISO, endISO]. Lifted here for
 * symmetry with the events-side helper; not exported elsewhere.
 */
export function _calendarDateRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cursor = startISO;
  while (cursor <= endISO) {
    out.push(cursor);
    cursor = format(addDays(parseISO(cursor), 1), 'yyyy-MM-dd');
  }
  return out;
}

