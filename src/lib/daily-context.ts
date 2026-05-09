import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
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
import { dayUtcBounds } from '@/lib/daily-utils';

export type CurrentPriorityTask = Task; // not yet time-blocked
export type CurrentPriorityEvent = Event; // already time-blocked

export type AlreadyBlockedItem = {
  kind: 'task' | 'event';
  priorityId: string;
  priorityName: string;
  priorityColor: string;
  task?: Task;
  event?: Event;
  startUtc: Date;
  endUtc: Date;
};

export type DailyContext = {
  /** Current priority's tasks for the day, NOT yet time-blocked. The
   *  chatbot's job is to time-block these via set_task_time_block. */
  tasksForCurrentPriority: CurrentPriorityTask[];
  /** Current priority's events already on the day (time-bound, scheduled
   *  by Weekly Plan or manually). Surfaced read-only — chatbot doesn't
   *  re-block them. */
  eventsForCurrentPriority: CurrentPriorityEvent[];
  /** Time blocks already claimed by EARLIER priorities in the queue
   *  (their tasks with time_block_* set, plus their events). The chatbot
   *  must not overlap these. */
  alreadyBlockedByHigherPriorities: AlreadyBlockedItem[];
  /** Calendar feed events for the day (immutable). */
  calendarFeedEvents: CalendarFeedEvent[];
};

export type LoadDailyContextInput = {
  userId: string;
  dateISO: string; // tomorrow's date (or whatever day we're planning)
  currentPriorityId: string;
  /** IDs of priorities that come BEFORE the current one in the queue.
   *  Same robustness pattern as M13's weekly-context — explicit ID set
   *  rather than position-arithmetic. */
  earlierPriorityIds: string[];
  userTimezone: string;
};

async function loadCurrentPriorityTasks(
  input: LoadDailyContextInput,
  startUtc: Date,
  endUtc: Date,
): Promise<Task[]> {
  // Tasks for the current priority where target_date = dateISO AND time
  // block is NOT yet set. These are the candidates for time-blocking.
  return db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.userId, input.userId),
        eq(tasksTable.ownerPriorityId, input.currentPriorityId),
        isNull(tasksTable.deletedAt),
        isNull(tasksTable.timeBlockStart),
        sql`(${tasksTable.targetDate} = ${input.dateISO}::date
             OR (${tasksTable.timeBlockStart} >= ${startUtc}
                 AND ${tasksTable.timeBlockStart} <= ${endUtc}))`,
      ),
    );
}

async function loadCurrentPriorityEvents(
  input: LoadDailyContextInput,
  startUtc: Date,
  endUtc: Date,
): Promise<Event[]> {
  return db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.userId, input.userId),
        eq(eventsTable.ownerPriorityId, input.currentPriorityId),
        isNull(eventsTable.deletedAt),
        gte(eventsTable.startTime, startUtc),
        lte(eventsTable.startTime, endUtc),
      ),
    );
}

async function loadHigherBlocks(
  input: LoadDailyContextInput,
  startUtc: Date,
  endUtc: Date,
) {
  if (input.earlierPriorityIds.length === 0) return { tasks: [], events: [] };
  const [taskRows, eventRows] = await Promise.all([
    db
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
          gte(tasksTable.timeBlockStart, startUtc),
          lte(tasksTable.timeBlockStart, endUtc),
        ),
      ),
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
          inArray(priorities.id, input.earlierPriorityIds),
          gte(eventsTable.startTime, startUtc),
          lte(eventsTable.startTime, endUtc),
        ),
      ),
  ]);
  return { tasks: taskRows, events: eventRows };
}

export async function loadDailyContext(
  input: LoadDailyContextInput,
): Promise<DailyContext> {
  const { startUtc, endUtc } = dayUtcBounds(input.dateISO, input.userTimezone);

  const [tasksForCurrent, eventsForCurrent, higher, calendarFeed] = await Promise.all([
    loadCurrentPriorityTasks(input, startUtc, endUtc),
    loadCurrentPriorityEvents(input, startUtc, endUtc),
    loadHigherBlocks(input, startUtc, endUtc),
    getCalendarFeedEventsForRange(
      input.userId,
      input.dateISO,
      input.dateISO,
      input.userTimezone,
    ),
  ]);

  const alreadyBlockedByHigherPriorities: AlreadyBlockedItem[] = [
    ...higher.tasks
      .filter((row) => row.task.timeBlockStart && row.task.timeBlockEnd)
      .map((row) => ({
        kind: 'task' as const,
        priorityId: row.priorityId,
        priorityName: row.priorityName,
        priorityColor: row.priorityIcon.color,
        task: row.task,
        startUtc: row.task.timeBlockStart as Date,
        endUtc: row.task.timeBlockEnd as Date,
      })),
    ...higher.events.map((row) => ({
      kind: 'event' as const,
      priorityId: row.priorityId,
      priorityName: row.priorityName,
      priorityColor: row.priorityIcon.color,
      event: row.event,
      startUtc: row.event.startTime,
      endUtc: row.event.endTime,
    })),
  ];

  return {
    tasksForCurrentPriority: tasksForCurrent,
    eventsForCurrentPriority: eventsForCurrent,
    alreadyBlockedByHigherPriorities,
    calendarFeedEvents: calendarFeed,
  };
}

/** Load the FULL day-snapshot for rendering the DayCalendar (all priorities,
 *  any time block, plus calendar feed events). Used by the page server
 *  component for the initial render and after `router.refresh()` after each
 *  successful tool call. */
export async function loadDayCalendarSnapshot(input: {
  userId: string;
  dateISO: string;
  userTimezone: string;
}) {
  const { startUtc, endUtc } = dayUtcBounds(input.dateISO, input.userTimezone);

  const [taskRows, eventRows, calendarFeed] = await Promise.all([
    db
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
          or(
            sql`${tasksTable.targetDate} = ${input.dateISO}::date`,
            and(
              gte(tasksTable.timeBlockStart, startUtc),
              lte(tasksTable.timeBlockStart, endUtc),
            ),
          ),
        ),
      ),
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
          gte(eventsTable.startTime, startUtc),
          lte(eventsTable.startTime, endUtc),
        ),
      ),
    getCalendarFeedEventsForRange(
      input.userId,
      input.dateISO,
      input.dateISO,
      input.userTimezone,
    ),
  ]);

  return { taskRows, eventRows, calendarFeed };
}
