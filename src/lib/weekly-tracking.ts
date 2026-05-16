import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { events as eventsTable, tasks as tasksTable } from '@/db/schema';
import { currentDateInTz } from '@/lib/quarters';
import { weekStartForDate, weekUtcBounds } from '@/lib/week-utils';

/**
 * Scheduled minutes this week (Mon–Sun, user TZ) per Priority — the sum of
 * time-blocked task durations + event durations whose owner is that
 * Priority. Drives the Council card "X min scheduled this week vs target"
 * readout (TDD M20: weekly time-tracking display per Priority). Read-only
 * aggregation, no schema.
 */
export async function getScheduledMinutesThisWeek(
  userId: string,
  userTimezone: string,
): Promise<Record<string, number>> {
  const today = currentDateInTz(userTimezone);
  const weekStart = weekStartForDate(today, userTimezone);
  const { startUtc, endUtc } = weekUtcBounds(weekStart, userTimezone);

  const [taskRows, eventRows] = await Promise.all([
    db
      .select({
        priorityId: tasksTable.ownerPriorityId,
        start: tasksTable.timeBlockStart,
        end: tasksTable.timeBlockEnd,
      })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, userId),
          isNull(tasksTable.deletedAt),
          gte(tasksTable.timeBlockStart, startUtc),
          lte(tasksTable.timeBlockStart, endUtc),
        ),
      ),
    db
      .select({
        priorityId: eventsTable.ownerPriorityId,
        start: eventsTable.startTime,
        end: eventsTable.endTime,
      })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, userId),
          isNull(eventsTable.deletedAt),
          gte(eventsTable.startTime, startUtc),
          lte(eventsTable.startTime, endUtc),
        ),
      ),
  ]);

  const minutes: Record<string, number> = {};
  const add = (pid: string, s: Date | null, e: Date | null) => {
    if (!s || !e) return;
    const m = Math.round((e.getTime() - s.getTime()) / 60000);
    if (m <= 0) return;
    minutes[pid] = (minutes[pid] ?? 0) + m;
  };
  for (const t of taskRows) add(t.priorityId, t.start, t.end);
  for (const ev of eventRows) add(ev.priorityId, ev.start, ev.end);
  return minutes;
}
