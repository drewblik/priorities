import { and, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  events as eventsTable,
  priorities,
  tasks as tasksTable,
} from '@/db/schema';
import { getCalendarFeedEventsForRange } from '@/lib/calendar-feeds';
import { dayUtcBounds } from '@/lib/daily-utils';
import { formatInTimeZone } from 'date-fns-tz';

export type Overlap =
  | { kind: 'task'; label: string; startUtc: Date; endUtc: Date; priorityName: string }
  | { kind: 'event'; label: string; startUtc: Date; endUtc: Date; priorityName: string }
  | { kind: 'feedEvent'; label: string; startUtc: Date; endUtc: Date; sourceName: string };

export type FindOverlapInput = {
  userId: string;
  dateISO: string;
  candidateStartUtc: Date;
  candidateEndUtc: Date;
  /** Don't flag overlaps with this Priority's own pre-existing items.
   *  Higher-priority Priorities + calendar feeds are the conflict set. */
  currentPriorityId: string;
  earlierPriorityIds: string[];
  userTimezone: string;
  /** Optional: ignore an existing task row when checking (e.g. when
   *  re-blocking the same task we're operating on). */
  ignoreTaskId?: string | null;
  /** Optional: ignore an existing event row. */
  ignoreEventId?: string | null;
};

/**
 * Returns the FIRST overlapping item in the query horizon (tomorrow's user-TZ
 * day bounds), or null if no overlap. Standard overlap predicate: two ranges
 * [a, b) and [c, d) overlap iff a < d AND c < b.
 *
 * Spec anchor: priorities-tdd.md §587-589 — "for daily: check if proposed
 * time block overlaps existing time block from earlier-priority Priority OR
 * calendar feed event."
 */
export async function findOverlap(input: FindOverlapInput): Promise<Overlap | null> {
  const { startUtc, endUtc } = dayUtcBounds(input.dateISO, input.userTimezone);

  // Higher-priority tasks already time-blocked tomorrow.
  const taskRows = input.earlierPriorityIds.length
    ? await db
        .select({
          task: tasksTable,
          priorityName: priorities.name,
        })
        .from(tasksTable)
        .innerJoin(priorities, eq(priorities.id, tasksTable.ownerPriorityId))
        .where(
          and(
            eq(tasksTable.userId, input.userId),
            isNull(tasksTable.deletedAt),
            isNull(priorities.deletedAt),
            inArray(priorities.id, input.earlierPriorityIds),
            gte(tasksTable.timeBlockStart, startUtc),
            lte(tasksTable.timeBlockStart, endUtc),
            // [a, b) overlaps [c, d) iff a < d AND c < b. We have:
            //   a = task.timeBlockStart, b = task.timeBlockEnd
            //   c = candidateStart,      d = candidateEnd
            // → task.timeBlockStart < candidateEnd AND candidateStart < task.timeBlockEnd
            lt(tasksTable.timeBlockStart, input.candidateEndUtc),
            sql`${tasksTable.timeBlockEnd} > ${input.candidateStartUtc}`,
            input.ignoreTaskId ? ne(tasksTable.id, input.ignoreTaskId) : undefined,
          ),
        )
    : [];

  if (taskRows.length > 0) {
    const t = taskRows[0]!;
    return {
      kind: 'task',
      label: t.task.title,
      startUtc: t.task.timeBlockStart!,
      endUtc: t.task.timeBlockEnd!,
      priorityName: t.priorityName,
    };
  }

  // Higher-priority events tomorrow.
  const eventRows = input.earlierPriorityIds.length
    ? await db
        .select({
          event: eventsTable,
          priorityName: priorities.name,
        })
        .from(eventsTable)
        .innerJoin(priorities, eq(priorities.id, eventsTable.ownerPriorityId))
        .where(
          and(
            eq(eventsTable.userId, input.userId),
            isNull(eventsTable.deletedAt),
            isNull(priorities.deletedAt),
            inArray(priorities.id, input.earlierPriorityIds),
            gte(eventsTable.startTime, startUtc),
            lte(eventsTable.startTime, endUtc),
            lt(eventsTable.startTime, input.candidateEndUtc),
            sql`${eventsTable.endTime} > ${input.candidateStartUtc}`,
            input.ignoreEventId ? ne(eventsTable.id, input.ignoreEventId) : undefined,
          ),
        )
    : [];

  if (eventRows.length > 0) {
    const e = eventRows[0]!;
    return {
      kind: 'event',
      label: e.event.title,
      startUtc: e.event.startTime,
      endUtc: e.event.endTime,
      priorityName: e.priorityName,
    };
  }

  // Current priority's OWN events tomorrow (we don't want to time-block a
  // task on top of an event the same priority already scheduled in M13).
  const ownEventRows = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.userId, input.userId),
        eq(eventsTable.ownerPriorityId, input.currentPriorityId),
        isNull(eventsTable.deletedAt),
        gte(eventsTable.startTime, startUtc),
        lte(eventsTable.startTime, endUtc),
        lt(eventsTable.startTime, input.candidateEndUtc),
        sql`${eventsTable.endTime} > ${input.candidateStartUtc}`,
        input.ignoreEventId ? ne(eventsTable.id, input.ignoreEventId) : undefined,
      ),
    );
  if (ownEventRows.length > 0) {
    const e = ownEventRows[0]!;
    return {
      kind: 'event',
      label: e.title,
      startUtc: e.startTime,
      endUtc: e.endTime,
      priorityName: 'this Priority',
    };
  }

  // Current priority's OWN already-blocked tasks (don't double-block).
  const ownTaskRows = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.userId, input.userId),
        eq(tasksTable.ownerPriorityId, input.currentPriorityId),
        isNull(tasksTable.deletedAt),
        gte(tasksTable.timeBlockStart, startUtc),
        lte(tasksTable.timeBlockStart, endUtc),
        lt(tasksTable.timeBlockStart, input.candidateEndUtc),
        sql`${tasksTable.timeBlockEnd} > ${input.candidateStartUtc}`,
        input.ignoreTaskId ? ne(tasksTable.id, input.ignoreTaskId) : undefined,
      ),
    );
  if (ownTaskRows.length > 0) {
    const t = ownTaskRows[0]!;
    return {
      kind: 'task',
      label: t.title,
      startUtc: t.timeBlockStart!,
      endUtc: t.timeBlockEnd!,
      priorityName: 'this Priority',
    };
  }

  // Calendar feed events tomorrow. Filter in JS — feed events live in a
  // separate table and we want active rows only (removed_from_source_at IS
  // NULL is already enforced by getCalendarFeedEventsForRange).
  const feedEvents = await getCalendarFeedEventsForRange(
    input.userId,
    input.dateISO,
    input.dateISO,
    input.userTimezone,
  );
  for (const fe of feedEvents) {
    if (
      fe.startTime < input.candidateEndUtc &&
      fe.endTime > input.candidateStartUtc
    ) {
      return {
        kind: 'feedEvent',
        label: fe.title,
        startUtc: fe.startTime,
        endUtc: fe.endTime,
        sourceName: 'calendar',
      };
    }
  }

  return null;
}

/** Format an Overlap into a chat-friendly conflict reason. */
export function describeOverlap(overlap: Overlap, userTimezone: string): string {
  const startLabel = formatInTimeZone(overlap.startUtc, userTimezone, 'h:mm a');
  const endLabel = formatInTimeZone(overlap.endUtc, userTimezone, 'h:mm a');
  if (overlap.kind === 'feedEvent') {
    return `conflict with calendar event "${overlap.label}" (${startLabel}–${endLabel})`;
  }
  return `conflict with ${overlap.priorityName}'s ${overlap.kind} "${overlap.label}" (${startLabel}–${endLabel})`;
}
