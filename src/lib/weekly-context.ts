import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  calendarFeedEvents,
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
  currentPriorityPosition: number;
  currentQuarterId: string;
  weekNumberInQuarter: number;
  userTimezone: string;
};

/**
 * Loads the cross-priority context the Weekly Planning chatbot needs in
 * its system prompt. Tasks/events from higher-priority Priorities (lower
 * `position` than current) for the week + all calendar feed events for
 * the week + the quarter's focus label for this week (if set).
 */
export async function loadWeeklyContext(
  input: LoadWeeklyContextInput,
): Promise<WeeklyContext> {
  const { startUtc, endUtc } = weekUtcBounds(input.weekStartISO, input.userTimezone);

  const [higherTaskRows, higherEventRows, feedEvents, allFocus] = await Promise.all([
    // Higher-priority tasks for this week.
    db
      .select({
        task: tasksTable,
        priorityId: priorities.id,
        priorityName: priorities.name,
        priorityIcon: priorities.icon,
        priorityPosition: priorities.position,
      })
      .from(tasksTable)
      .innerJoin(priorities, eq(priorities.id, tasksTable.ownerPriorityId))
      .where(
        and(
          eq(tasksTable.userId, input.userId),
          isNull(tasksTable.deletedAt),
          isNull(priorities.deletedAt),
          sql`${priorities.position} < ${input.currentPriorityPosition}`,
          sql`(${tasksTable.targetDate} BETWEEN ${input.weekStartISO}::date AND ${input.weekEndISO}::date
               OR (${tasksTable.timeBlockStart} >= ${startUtc}
                   AND ${tasksTable.timeBlockStart} <= ${endUtc}))`,
        ),
      ),
    // Higher-priority events for this week.
    db
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
          sql`${priorities.position} < ${input.currentPriorityPosition}`,
          gte(eventsTable.startTime, startUtc),
          lte(eventsTable.startTime, endUtc),
        ),
      ),
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
