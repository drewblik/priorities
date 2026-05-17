import { addDays } from 'date-fns';
import ICAL from 'ical.js';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  calendarFeedConfigs,
  calendarFeedEvents,
  type CalendarFeedConfig,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { decryptFeedUrl, recordFeedSyncResult } from '@/lib/calendar-feeds';

export type ParsedEvent = {
  externalId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
};

export type SyncFeedResult = {
  success: boolean;
  upserted: number;
  reconciled: { hardDeleted: number; markedRemoved: number };
  error?: string;
};

// Two attempts at 25s each (≈50s worst case, under Vercel Hobby's 60s
// function ceiling). Outlook published .ics endpoints are slow on a cold
// request but the fetch primes a server-side cache, so the retry usually
// lands fast. A feed that fails both 25s attempts is a documented Hobby
// limitation (→ M21 / Vercel Pro / out-of-band ingestion).
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_ATTEMPTS = 2;

/** Sync horizon — past 7 days through next 60. Recurring instances outside
 *  this window aren't materialized so the events table stays bounded. */
export function getSyncHorizon(now: Date = new Date()): { start: Date; end: Date } {
  return { start: addDays(now, -7), end: addDays(now, 60) };
}

/**
 * Fetch + parse an .ics URL. Expands recurring VEVENTs into per-instance
 * ParsedEvents within the horizon. Throws on network/parse failure.
 */
export async function fetchAndParseIcs(
  url: string,
  horizon: { start: Date; end: Date } = getSyncHorizon(),
): Promise<ParsedEvent[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: { Accept: 'text/calendar, text/plain, */*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return parseIcs(text, horizon);
    } catch (err) {
      lastErr = err;
      // Retry once on the cold-fetch timeout/5xx; the 2nd request usually
      // hits the provider's now-warm cache.
      if (attempt < FETCH_ATTEMPTS) continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function parseIcs(
  text: string,
  horizon: { start: Date; end: Date },
): ParsedEvent[] {
  const jcal = ICAL.parse(text);
  const cal = new ICAL.Component(jcal);
  const vevents = cal.getAllSubcomponents('vevent');
  const horizonStart = ICAL.Time.fromJSDate(horizon.start, true);
  const horizonEnd = ICAL.Time.fromJSDate(horizon.end, true);

  const out: ParsedEvent[] = [];
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (!event.uid) continue;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      // Cap iterations defensively in case of malformed RRULE without UNTIL/COUNT.
      let safetyN = 0;
      // Use loose != null because ical.js's iterator returns undefined (not
      // strict null) at exhaustion, which a `!== null` guard would walk past.
      let next: ICAL.Time | null | undefined;
      while ((next = iterator.next()) != null) {
        if (++safetyN > 1000) break;
        if (next.compare(horizonEnd) > 0) break;
        if (next.compare(horizonStart) < 0) continue;
        try {
          const occ = event.getOccurrenceDetails(next);
          const allDay = occ.startDate.isDate === true;
          out.push({
            externalId: `${event.uid}__${occ.startDate.toString()}`,
            title: occ.item.summary || '(no title)',
            description: occ.item.description || null,
            startTime: occ.startDate.toJSDate(),
            endTime: occ.endDate.toJSDate(),
            allDay,
          });
        } catch {
          // Some recurrence-id exceptions throw; skip and continue.
        }
      }
    } else {
      const start = event.startDate?.toJSDate();
      if (!start) continue;
      if (start < horizon.start || start > horizon.end) continue;
      const end = event.endDate?.toJSDate() ?? new Date(start.getTime() + 30 * 60_000);
      const allDay = event.startDate?.isDate === true;
      out.push({
        externalId: event.uid,
        title: event.summary || '(no title)',
        description: event.description || null,
        startTime: start,
        endTime: end,
        allDay,
      });
    }
  }
  return out;
}

/**
 * Upsert + reconcile a single feed. Idempotent — re-running on the same .ics
 * leaves the DB unchanged. Errors land in the config's `last_sync_error` and
 * the function returns `{ success: false, error }`.
 */
export async function syncFeed(config: CalendarFeedConfig): Promise<SyncFeedResult> {
  const startedAt = new Date();
  let parsed: ParsedEvent[];
  try {
    const url = decryptFeedUrl(config);
    parsed = await fetchAndParseIcs(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordFeedSyncResult(config.id, { success: false, error: msg, at: startedAt });
    return { success: false, upserted: 0, reconciled: { hardDeleted: 0, markedRemoved: 0 }, error: msg };
  }

  const fetchedIds = new Set(parsed.map((e) => e.externalId));

  // Upsert all parsed events. Drizzle's onConflictDoUpdate with the unique
  // index target maps to ON CONFLICT (source_feed_id, external_id). The SET
  // clause uses `excluded.<col>` so each row's new values land. Re-appearing
  // rows clear `removed_from_source_at`.
  let upserted = 0;
  if (parsed.length > 0) {
    const rows = parsed.map((e) => ({
      id: newId('cfe'),
      sourceFeedId: config.id,
      userId: config.userId,
      externalId: e.externalId,
      title: e.title,
      description: e.description,
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      lastSyncedAt: startedAt,
      removedFromSourceAt: null,
    }));
    await db
      .insert(calendarFeedEvents)
      .values(rows)
      .onConflictDoUpdate({
        target: [calendarFeedEvents.sourceFeedId, calendarFeedEvents.externalId],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          startTime: sql`excluded.start_time`,
          endTime: sql`excluded.end_time`,
          allDay: sql`excluded.all_day`,
          lastSyncedAt: sql`excluded.last_synced_at`,
          removedFromSourceAt: sql`NULL`,
        },
      });
    upserted = rows.length;
  }

  // Reconcile: rows in DB whose external_id is NOT in fetchedIds AND not
  // already marked removed. Future-dated removals are hard-deleted; past-dated
  // get `removed_from_source_at` set so retrospective views can show them
  // with an "ⓧ removed from calendar" badge (TDD §725-748).
  const existing = await db
    .select({
      id: calendarFeedEvents.id,
      externalId: calendarFeedEvents.externalId,
      startTime: calendarFeedEvents.startTime,
    })
    .from(calendarFeedEvents)
    .where(
      and(
        eq(calendarFeedEvents.sourceFeedId, config.id),
        isNull(calendarFeedEvents.removedFromSourceAt),
      ),
    );

  const futureToDelete: string[] = [];
  const pastToMarkRemoved: string[] = [];
  for (const row of existing) {
    if (fetchedIds.has(row.externalId)) continue;
    if (row.startTime > startedAt) {
      futureToDelete.push(row.id);
    } else {
      pastToMarkRemoved.push(row.id);
    }
  }

  if (futureToDelete.length > 0) {
    await db
      .delete(calendarFeedEvents)
      .where(inArray(calendarFeedEvents.id, futureToDelete));
  }
  if (pastToMarkRemoved.length > 0) {
    await db
      .update(calendarFeedEvents)
      .set({ removedFromSourceAt: startedAt })
      .where(inArray(calendarFeedEvents.id, pastToMarkRemoved));
  }

  await recordFeedSyncResult(config.id, { success: true, at: startedAt });
  return {
    success: true,
    upserted,
    reconciled: {
      hardDeleted: futureToDelete.length,
      markedRemoved: pastToMarkRemoved.length,
    },
  };
}

/**
 * Cron entry point: select all feeds that are due (no last_synced_at, or
 * last_synced_at + sync_cadence_min has passed) across all users, and sync
 * each. Optimistic — see plan note about not using FOR UPDATE SKIP LOCKED;
 * idempotent upserts make double-sync from overlapping cron runs harmless at
 * v1 scale.
 */
export async function syncDueFeeds(): Promise<{ syncedFeeds: number; errors: number }> {
  const dueRows = await db
    .select()
    .from(calendarFeedConfigs)
    .where(
      and(
        isNull(calendarFeedConfigs.deletedAt),
        sql`(${calendarFeedConfigs.lastSyncedAt} IS NULL
             OR ${calendarFeedConfigs.lastSyncedAt} + (${calendarFeedConfigs.syncCadenceMin}::int * INTERVAL '1 minute') <= NOW())`,
      ),
    );

  let errors = 0;
  for (const config of dueRows) {
    try {
      const result = await syncFeed(config);
      if (!result.success) errors += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `syncFeed crashed for config=${config.id}:`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
  }

  return { syncedFeeds: dueRows.length, errors };
}

// Suppress unused-import warning if `gt` ever becomes unused after refactor.
void gt;

/**
 * M20 sync-before-plan: refresh THIS user's feeds whose `last_synced_at`
 * is null or older than `maxAgeMin`. Bounded + throttled so opening a
 * plan/Today page is calendar-correct without re-fetching on every load.
 * External calendar events take hard precedence over Priority scheduling,
 * so plan pages call this before computing queue/conflict context.
 * Best-effort: a feed fetch failure is logged, never thrown.
 */
export async function syncDueFeedsForUser(
  userId: string,
  maxAgeMin = 5,
): Promise<{ syncedFeeds: number; errors: number }> {
  const dueRows = await db
    .select()
    .from(calendarFeedConfigs)
    .where(
      and(
        eq(calendarFeedConfigs.userId, userId),
        isNull(calendarFeedConfigs.deletedAt),
        sql`(${calendarFeedConfigs.lastSyncedAt} IS NULL
             OR ${calendarFeedConfigs.lastSyncedAt} + (${maxAgeMin}::int * INTERVAL '1 minute') <= NOW())`,
      ),
    );

  let errors = 0;
  for (const config of dueRows) {
    try {
      const result = await syncFeed(config);
      if (!result.success) errors += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `syncDueFeedsForUser: syncFeed crashed for config=${config.id}:`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
  }
  return { syncedFeeds: dueRows.length, errors };
}
