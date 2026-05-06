import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getCalendarFeedEventsForRange } from '@/lib/calendar-feeds';
import { getOrCreateSession, getClosedSessions } from '@/lib/chat-sessions';
import { getEventsForDateRange } from '@/lib/events';
import { getWeeklyPlanningQueue } from '@/lib/priorities';
import { ensureCurrentQuarter, weeksInQuarter } from '@/lib/quarters';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';
import { getTasksForDate } from '@/lib/tasks';
import {
  daysInWeek,
  isMondayInTz,
  weekStartForDate,
  weekNumberWithinQuarter,
} from '@/lib/week-utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { weekStartISO?: string } | null;
  let weekStartISO = body?.weekStartISO;
  if (!weekStartISO || !isMondayInTz(weekStartISO, session.user.timezone)) {
    weekStartISO = weekStartForDate(
      new Date().toISOString().slice(0, 10),
      session.user.timezone,
    );
  }

  const quarter = await ensureCurrentQuarter(session.user.id, session.user.timezone);
  const weekNumber = weekNumberWithinQuarter(weekStartISO, quarter);

  const queue = await getWeeklyPlanningQueue(session.user.id);
  const closed = await getClosedSessions(session.user.id, 'weekly', weekStartISO);
  const closedPriorityIds = new Set(closed.map((s) => s.priorityId).filter((v): v is string => !!v));

  const current = queue.find((p) => !closedPriorityIds.has(p.id));

  // Always assemble the week-snapshot for the page (tasks/events for the week,
  // calendar feed events, quarter focus rows). The page uses these to render
  // WeekCalendar regardless of whether there's a current priority.
  const week = daysInWeek(weekStartISO);
  const weekEndISO = week[week.length - 1] ?? weekStartISO;
  const [tasksByDay, eventsForWeek, calendarFeed, allFocus] = await Promise.all([
    Promise.all(week.map((d) => getTasksForDate(session.user.id, d))),
    getEventsForDateRange(session.user.id, weekStartISO, weekEndISO, session.user.timezone),
    getCalendarFeedEventsForRange(session.user.id, weekStartISO, weekEndISO, session.user.timezone),
    getQuarterWeekFocusForQuarter(session.user.id, quarter.id),
  ]);

  if (!current) {
    return NextResponse.json({
      weekStartISO,
      quarterId: quarter.id,
      weekNumber,
      totalWeeksInQuarter: weeksInQuarter(quarter.startDate, quarter.endDate),
      queue: queue.map((p) => ({ id: p.id, name: p.name, color: p.icon.color })),
      doneIds: Array.from(closedPriorityIds),
      currentPriorityId: null,
      sessionId: null,
      tasksByDay,
      eventsForWeek,
      calendarFeed,
      quarterFocus: allFocus,
    });
  }

  const chatSession = await getOrCreateSession({
    userId: session.user.id,
    sessionType: 'weekly',
    contextRef: weekStartISO,
    priorityId: current.id,
  });

  return NextResponse.json({
    weekStartISO,
    quarterId: quarter.id,
    weekNumber,
    totalWeeksInQuarter: weeksInQuarter(quarter.startDate, quarter.endDate),
    queue: queue.map((p) => ({ id: p.id, name: p.name, color: p.icon.color })),
    doneIds: Array.from(closedPriorityIds),
    currentPriorityId: current.id,
    sessionId: chatSession.id,
    tasksByDay,
    eventsForWeek,
    calendarFeed,
    quarterFocus: allFocus,
  });
}
