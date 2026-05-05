import { getCalendarFeedEventsForRange, getFeedsForUser } from '@/lib/calendar-feeds';
import { getEventsForDateRange } from '@/lib/events';
import { getPrioritiesForUser } from '@/lib/priorities';
import { getTasksForDate } from '@/lib/tasks';
import type { CalendarFeedEvent, Priority } from '@/db/schema';
import type { DisplayedEvent, DisplayedTask } from '@/lib/recurrence';

export type TimelineItem =
  | { kind: 'task'; task: DisplayedTask; priority: Priority; sortKey: number }
  | { kind: 'event'; event: DisplayedEvent; priority: Priority; sortKey: number }
  | { kind: 'feedEvent'; feedEvent: CalendarFeedEvent; sourceName: string; sortKey: number };

export type DailyData = {
  timelineItems: TimelineItem[];
  unscheduledTasks: { task: DisplayedTask; priority: Priority }[];
  priorityById: Map<string, Priority>;
};

/**
 * Fetch + assemble everything Daily View needs for one calendar date in the
 * user's TZ. Returns time-blocked items (tasks with a time block + all events)
 * sorted chronologically, plus the day's unscheduled tasks (target_date == date,
 * no time block). Items whose owner Priority is missing/soft-deleted are filtered
 * out defensively — the foreign-key cascade keeps this rare but possible during
 * the brief window of a soft-delete cascade.
 */
export async function fetchDailyData(
  userId: string,
  dateISO: string,
  userTimezone: string,
): Promise<DailyData> {
  const [tasks, events, priorities, feedEvents, feeds] = await Promise.all([
    getTasksForDate(userId, dateISO),
    getEventsForDateRange(userId, dateISO, dateISO, userTimezone),
    getPrioritiesForUser(userId, { includeArchived: true }),
    getCalendarFeedEventsForRange(userId, dateISO, dateISO, userTimezone),
    getFeedsForUser(userId),
  ]);

  const feedNameById = new Map<string, string>();
  for (const f of feeds) feedNameById.set(f.id, f.name);

  const priorityById = new Map<string, Priority>();
  for (const p of priorities) priorityById.set(p.id, p);

  const timelineItems: TimelineItem[] = [];
  const unscheduledTasks: { task: DisplayedTask; priority: Priority }[] = [];

  for (const t of tasks) {
    // Skip recurring templates themselves — only their virtual instances
    // (or override rows) belong on a date-scoped view. The template row for
    // a "Weekly run" on Monday isn't a single Monday-the-12th task; the
    // virtual instance for Monday-the-12th is what shows up here. The
    // getTasksForDate helper already returns the virtual instance when the
    // pattern includes `dateISO` and skips it when an override covers the
    // date. The template row itself only surfaces if its target_date ==
    // dateISO AND there's no recurrence. To be safe, drop any row whose
    // recurrence is non-null AND instance_of_task_id is null (= a real
    // template row) — that won't normally happen here but the guard is cheap.
    if (t.recurrence !== null && t.instanceOfTaskId === null && t.kind === 'real') continue;

    const priority = priorityById.get(t.ownerPriorityId);
    if (!priority) continue;

    if (t.timeBlockStart && t.timeBlockEnd) {
      timelineItems.push({
        kind: 'task',
        task: t,
        priority,
        sortKey: t.timeBlockStart.getTime(),
      });
    } else {
      unscheduledTasks.push({ task: t, priority });
    }
  }

  for (const e of events) {
    const priority = priorityById.get(e.ownerPriorityId);
    if (!priority) continue;
    timelineItems.push({
      kind: 'event',
      event: e,
      priority,
      sortKey: e.startTime.getTime(),
    });
  }

  for (const fe of feedEvents) {
    const sourceName = feedNameById.get(fe.sourceFeedId) ?? '(unknown feed)';
    timelineItems.push({
      kind: 'feedEvent',
      feedEvent: fe,
      sourceName,
      sortKey: fe.startTime.getTime(),
    });
  }

  timelineItems.sort((a, b) => a.sortKey - b.sortKey);

  // Stable-sort unscheduled by created_at desc so the most recently added
  // task floats to the top of the list.
  unscheduledTasks.sort(
    (a, b) => b.task.createdAt.getTime() - a.task.createdAt.getTime(),
  );

  return { timelineItems, unscheduledTasks, priorityById };
}
