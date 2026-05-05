import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, asc, eq, isNotNull, isNull, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { events, type Event, type Recurrence } from '@/db/schema';
import { newId } from '@/lib/id';
import { verifyPriorityOwnership } from '@/lib/priority-ownership';
import {
  type DisplayedEvent,
  materializeVirtualEvent,
  recurrenceIncludesDate,
} from '@/lib/recurrence';

export type CreateEventInput = {
  ownerPriorityId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  recurrence?: Recurrence | null;
};

export type UpdateEventPatch = {
  title?: string;
  description?: string | null;
  startTime?: Date;
  endTime?: Date;
  recurrence?: Recurrence | null;
  completionStatus?: 'attended' | 'missed' | null;
};

export async function getEventsForPriority(
  userId: string,
  priorityId: string,
): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.ownerPriorityId, priorityId),
        isNull(events.deletedAt),
      ),
    )
    .orderBy(asc(events.startTime));
}

export async function getEventById(userId: string, eventId: string): Promise<Event | null> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns the user's events whose start_time falls on any calendar date in
 * `[startISO, endISO]` interpreted in the user's timezone, plus virtual
 * instances of recurring templates whose pattern includes any of those dates.
 * See TDD §937-970 (events analog).
 *
 * Critical: the bounds are computed via `fromZonedTime` so that "May 5 in
 * America/Los_Angeles" maps to `2026-05-05T07:00:00Z` through
 * `2026-05-06T06:59:59Z` — NOT the naïve `2026-05-05T00:00Z .. 23:59Z` UTC
 * range. Without this, an event created at "May 4 10:32 PM PT" (which stores
 * as `2026-05-05T05:32Z`) would erroneously appear on the May 5 page.
 */
export async function getEventsForDateRange(
  userId: string,
  startISO: string,
  endISO: string,
  userTimezone: string,
): Promise<DisplayedEvent[]> {
  const startUtc = fromZonedTime(`${startISO}T00:00:00`, userTimezone);
  const endUtc = fromZonedTime(`${endISO}T23:59:59.999`, userTimezone);

  const realRows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        gte(events.startTime, startUtc),
        lte(events.startTime, endUtc),
        isNull(events.deletedAt),
      ),
    );

  const templates = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        isNotNull(events.recurrence),
        isNull(events.instanceOfEventId),
        isNull(events.deletedAt),
      ),
    );

  // Override coverage keyed by user-TZ date (NOT UTC date) so it matches
  // the dateISO we'll check against in the virtual loop.
  const coveredTemplates = new Set(
    realRows
      .filter((e) => e.instanceOfEventId !== null)
      .map(
        (e) =>
          `${e.instanceOfEventId}:${formatInTimeZone(e.startTime, userTimezone, 'yyyy-MM-dd')}`,
      ),
  );

  // Walk calendar-date strings rather than UTC ms increments — sidesteps
  // any DST drift across the range.
  const cursorDates: string[] = [];
  let cursor = startISO;
  while (cursor <= endISO) {
    cursorDates.push(cursor);
    cursor = format(addDays(parseISO(cursor), 1), 'yyyy-MM-dd');
  }

  const virtuals: DisplayedEvent[] = [];
  for (const dateISO of cursorDates) {
    for (const template of templates) {
      if (!template.recurrence) continue;
      const templateStartISO = formatInTimeZone(template.startTime, userTimezone, 'yyyy-MM-dd');
      if (!recurrenceIncludesDate(template.recurrence, templateStartISO, dateISO)) continue;
      if (coveredTemplates.has(`${template.id}:${dateISO}`)) continue;
      virtuals.push(materializeVirtualEvent(template, dateISO));
    }
  }

  const reals: DisplayedEvent[] = realRows.map((e) => ({ ...e, kind: 'real' }));
  return [...reals, ...virtuals].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
}

export async function createEvent(
  userId: string,
  input: CreateEventInput,
): Promise<Event | null> {
  const ok = await verifyPriorityOwnership(userId, input.ownerPriorityId);
  if (!ok) return null;

  const [row] = await db
    .insert(events)
    .values({
      id: newId('evt'),
      ownerPriorityId: input.ownerPriorityId,
      userId,
      title: input.title,
      description: input.description ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      recurrence: input.recurrence ?? null,
    })
    .returning();
  return row ?? null;
}

export async function updateEvent(
  userId: string,
  eventId: string,
  patch: UpdateEventPatch,
): Promise<Event | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) set[key] = value;
  }
  if (patch.completionStatus !== undefined) {
    set.completedAt = patch.completionStatus === null ? null : new Date();
  }
  if (Object.keys(set).length === 1) return getEventById(userId, eventId);

  const [row] = await db
    .update(events)
    .set(set)
    .where(and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDeleteEvent(userId: string, eventId: string): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(events.id, eventId), eq(events.userId, userId), isNull(events.deletedAt)))
    .returning({
      id: events.id,
      recurrence: events.recurrence,
      instanceOf: events.instanceOfEventId,
    });
  if (updated.length === 0) return false;

  const head = updated[0];
  if (head && head.recurrence !== null && head.instanceOf === null) {
    await db
      .update(events)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(events.instanceOfEventId, eventId), isNull(events.deletedAt)));
  }
  return true;
}

/** M9-targeted helper for materializing an event override row. */
export async function materializeEventOverride(
  userId: string,
  templateId: string,
  startTime: Date,
  endTime: Date,
  patch: Omit<UpdateEventPatch, 'recurrence'> = {},
): Promise<Event | null> {
  const template = await getEventById(userId, templateId);
  if (!template || template.recurrence === null) return null;

  const [row] = await db
    .insert(events)
    .values({
      id: newId('evt'),
      ownerPriorityId: template.ownerPriorityId,
      userId,
      title: patch.title ?? template.title,
      description: patch.description ?? template.description,
      startTime,
      endTime,
      recurrence: null,
      instanceOfEventId: templateId,
      completionStatus: patch.completionStatus ?? null,
      completedAt: patch.completionStatus ? new Date() : null,
    })
    .returning();
  return row ?? null;
}

/**
 * Used by softDeletePriority. Soft-deletes all of a Priority's events except
 * those with completion_status set AND end_time in the past (TDD §472-512).
 */
export async function cascadeSoftDeleteEventsForPriority(
  ownerPriorityId: string,
  now: Date,
): Promise<void> {
  await db.execute(sql`
    UPDATE events SET deleted_at = ${now}, updated_at = ${now}
    WHERE owner_priority_id = ${ownerPriorityId}
      AND deleted_at IS NULL
      AND NOT (
        completed_at IS NOT NULL
        AND end_time < ${now}
      )
  `);
}
