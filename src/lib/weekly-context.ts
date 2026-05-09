import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  events as eventsTable,
  priorities,
  tasks as tasksTable,
  type CalendarFeedEvent,
  type Event,
  type Task,
} from '@/db/schema';
import { getCalendarFeedEventsForRange } from '@/lib/calendar-feeds';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';
import { weekUtcBounds } from '@/lib/week-utils';

export type AlreadyScheduledItem = {
  kind: 'task' | 'event';
  priorityId: string;
  priorityName: string;
  priorityColor: string;
  task?: Task;
  event?: Event;
  day: string; // YYYY-MM-DD in user TZ
};

export type WeeklyContext = {
  alreadyScheduledByHigherPriorities: AlreadyScheduledItem[];
  calendarFeedEvents: CalendarFeedEvent[];
  quarterFocusForThisWeek: { focusLabel: string } | null;
};

export type LoadWeeklyContextInput = {
  userId: string;
  weekStartISO: string;
  weekEndISO: string;
  currentPriorityId: string;
  /** IDs of priorities that come BEFORE the current one in the queue.
   *  Filtered explicitly rather than via `position <` arithmetic so duplicate
   *  position values (which can happen if a priority was deleted and the
   *  remaining rows weren't renumbered) don't silently exclude rows. */
  earlierPriorityIds: string[];
  currentQuarterId: string;
  weekNumberInQuarter: number;
  userTimezone: string;
};

async function loadHigherTasks(
  input: LoadWeeklyContextInput,
  startUtc: Date,
  endUtc: Date,
) {
  if (input.earlierPriorityIds.length === 0) return [];
  return db
    .select({
      task: tasksTable,
      priorityId: priorities.id,
      priorityName: priorities.name,
      priorityIcon: priorities.icon,
    })
    .from(tasksTable)
    .innerJoin(priorities, eq(priorities.id, tasksTable.ownerPriorityId))
    .where(
      and(
        eq(tasksTable.userId, input.userId),
        isNull(tasksTable.deletedAt),
        isNull(priorities.deletedAt),
        inArray(priorities.id, input.earlierPriorityIds),
        sql`(${tasksTable.targetDate} BETWEEN ${input.weekStartISO}::date AND ${input.weekEndISO}::date
             OR (${tasksTable.timeBlockStart} >= ${startUtc}
                 AND ${tasksTable.timeBlockStart} <= ${endUtc}))`,
      ),
    );
}

async function loadHigherEvents(
  input: LoadWeeklyContextInput,
  startUtc: Date,
  endUtc: Date,
) {
  if (input.earlierPriorityIds.length === 0) return [];
  return db
    .select({
      event: eventsTable,
      priorityId: priorities.id,
      priorityName: priorities.name,
      priorityIcon: priorities.icon,
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
      ),
    );
}

/**
 * Loads the cross-priority context the Weekly Planning chatbot needs in
 * its system prompt. Tasks/events from higher-priority Priorities (those
 * earlier in the queue than current) for the week + all calendar feed
 * events for the week + the quarter's focus label for this week (if set).
 */
export async function loadWeeklyContext(
  input: LoadWeeklyContextInput,
): Promise<WeeklyContext> {
  const { startUtc, endUtc } = weekUtcBounds(input.weekStartISO, input.userTimezone);

  const [higherTaskRows, higherEventRows, feedEvents, allFocus] = await Promise.all([
    loadHigherTasks(input, startUtc, endUtc),
    loadHigherEvents(input, startUtc, endUtc),
    getCalendarFeedEventsForRange(
      input.userId,
      input.weekStartISO,
      input.weekEndISO,
      input.userTimezone,
    ),
    getQuarterWeekFocusForQuarter(input.userId, input.currentQuarterId),
  ]);

  const focusForThisWeek = allFocus.find(
    (f) =>
      f.priorityId === input.currentPriorityId && f.weekNumber === input.weekNumberInQuarter,
  );

  const alreadyScheduledByHigherPriorities: AlreadyScheduledItem[] = [
    ...higherTaskRows.map((row) => {
      const day =
        row.task.targetDate ??
        (row.task.timeBlockStart
          ? row.task.timeBlockStart.toISOString().slice(0, 10)
          : input.weekStartISO);
      return {
        kind: 'task' as const,
        priorityId: row.priorityId,
        priorityName: row.priorityName,
        priorityColor: row.priorityIcon.color,
        task: row.task,
        day,
      };
    }),
    ...higherEventRows.map((row) => ({
      kind: 'event' as const,
      priorityId: row.priorityId,
      priorityName: row.priorityName,
      priorityColor: row.priorityIcon.color,
      event: row.event,
      day: row.event.startTime.toISOString().slice(0, 10),
    })),
  ];

  return {
    alreadyScheduledByHigherPriorities,
    calendarFeedEvents: feedEvents,
    quarterFocusForThisWeek: focusForThisWeek
      ? { focusLabel: focusForThisWeek.focusLabel }
      : null,
  };
}
