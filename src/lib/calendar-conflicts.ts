import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { addDays, format, parseISO } from 'date-fns';
import { db } from '@/db/client';
import {
  events as eventsTable,
  priorities,
  tasks as tasksTable,
} from '@/db/schema';
import { getCalendarFeedEventsForRange } from '@/lib/calendar-feeds';
import { currentDateInTz } from '@/lib/quarters';

export type CalendarConflict = {
  /** The user's planned item that now overlaps a calendar event. */
  kind: 'task' | 'event';
  itemId: string;
  itemTitle: string;
  priorityName: string;
  priorityColor: string;
  itemStartUtc: Date;
  itemEndUtc: Date;
  /** The immovable external calendar event it collides with. */
  calendarTitle: string;
  calendarStartUtc: Date;
  calendarEndUtc: Date;
  /** Pre-formatted, user-TZ display strings for the UI. */
  itemRange: string;
  calendarRange: string;
  day: string;
};

const HORIZON_DAYS = 7;

function overlaps(aS: Date, aE: Date, bS: Date, bE: Date): boolean {
  return aS < bE && bS < aE;
}

/**
 * Scan for conflicts between active external calendar-feed events and the
 * user's already-time-blocked tasks/events over [today, today+7d] in the
 * user's TZ. External calendar events are immovable, so any overlap is a
 * problem the user needs to resolve. M20 surfaces these read-only (banner
 * + /conflicts list); M21 wires the Master-Chat resolve flow.
 */
export async function findCalendarConflicts(
  userId: string,
  userTimezone: string,
): Promise<CalendarConflict[]> {
  const todayISO = currentDateInTz(userTimezone);
  const endISO = format(addDays(parseISO(todayISO), HORIZON_DAYS), 'yyyy-MM-dd');

  const feedEvents = await getCalendarFeedEventsForRange(
    userId,
    todayISO,
    endISO,
    userTimezone,
  );
  if (feedEvents.length === 0) return [];

  // Window bounds in UTC for the time-blocked queries.
  const winStart = feedEvents.reduce(
    (min, e) => (e.startTime < min ? e.startTime : min),
    feedEvents[0]!.startTime,
  );
  const winEnd = feedEvents.reduce(
    (max, e) => (e.endTime > max ? e.endTime : max),
    feedEvents[0]!.endTime,
  );

  const [taskRows, eventRows] = await Promise.all([
    db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        start: tasksTable.timeBlockStart,
        end: tasksTable.timeBlockEnd,
        priorityName: priorities.name,
        priorityIcon: priorities.icon,
      })
      .from(tasksTable)
      .innerJoin(priorities, eq(priorities.id, tasksTable.ownerPriorityId))
      .where(
        and(
          eq(tasksTable.userId, userId),
          isNull(tasksTable.deletedAt),
          isNull(priorities.deletedAt),
          ne(tasksTable.status, 'done'),
          gte(tasksTable.timeBlockStart, winStart),
          lte(tasksTable.timeBlockStart, winEnd),
        ),
      ),
    db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        start: eventsTable.startTime,
        end: eventsTable.endTime,
        priorityName: priorities.name,
        priorityIcon: priorities.icon,
      })
      .from(eventsTable)
      .innerJoin(priorities, eq(priorities.id, eventsTable.ownerPriorityId))
      .where(
        and(
          eq(eventsTable.userId, userId),
          isNull(eventsTable.deletedAt),
          isNull(priorities.deletedAt),
          gte(eventsTable.startTime, winStart),
          lte(eventsTable.startTime, winEnd),
        ),
      ),
  ]);

  const fmtRange = (s: Date, e: Date) =>
    `${formatInTimeZone(s, userTimezone, 'EEE LLL d, h:mm a')}–${formatInTimeZone(
      e,
      userTimezone,
      'h:mm a',
    )}`;

  const conflicts: CalendarConflict[] = [];

  const consider = (
    kind: 'task' | 'event',
    row: {
      id: string;
      title: string;
      start: Date | null;
      end: Date | null;
      priorityName: string;
      priorityIcon: { color: string };
    },
  ) => {
    if (!row.start || !row.end) return;
    for (const fe of feedEvents) {
      if (fe.allDay) continue; // all-day calendar items don't block a time slot
      if (overlaps(row.start, row.end, fe.startTime, fe.endTime)) {
        conflicts.push({
          kind,
          itemId: row.id,
          itemTitle: row.title,
          priorityName: row.priorityName,
          priorityColor: row.priorityIcon.color,
          itemStartUtc: row.start,
          itemEndUtc: row.end,
          calendarTitle: fe.title,
          calendarStartUtc: fe.startTime,
          calendarEndUtc: fe.endTime,
          itemRange: fmtRange(row.start, row.end),
          calendarRange: fmtRange(fe.startTime, fe.endTime),
          day: formatInTimeZone(row.start, userTimezone, 'yyyy-MM-dd'),
        });
        break; // one conflict per planned item is enough to flag it
      }
    }
  };

  for (const t of taskRows) consider('task', t);
  for (const e of eventRows) consider('event', e);

  conflicts.sort((a, b) => a.itemStartUtc.getTime() - b.itemStartUtc.getTime());
  return conflicts;
}

/** Cheap count for the banner (runs the same scan; conflicts are rare so
 *  the extra rows are negligible at single-user scale). */
export async function countCalendarConflicts(
  userId: string,
  userTimezone: string,
): Promise<number> {
  return (await findCalendarConflicts(userId, userTimezone)).length;
}
