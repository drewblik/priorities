import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getCalendarFeedEventsForRange } from '@/lib/calendar-feeds';
import { extractAssistantText, loadThread } from '@/lib/chat-messages';
import { getClosedSessions, getOrCreateSession } from '@/lib/chat-sessions';
import { getEventsForDateRange } from '@/lib/events';
import { getWeeklyPlanningQueue } from '@/lib/priorities';
import { ensureCurrentQuarter, weeksInQuarter } from '@/lib/quarters';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';
import { getTasksForDate } from '@/lib/tasks';
import {
  daysInWeek,
  isMondayInTz,
  weekRangeLabel,
  weekNumberWithinQuarter,
} from '@/lib/week-utils';
import { ChatPanel, type WeeklyChatPanelInitial } from './ChatPanel';
import { EndSessionPlaceholder } from './EndSessionPlaceholder';
import { QueuePanel } from './QueuePanel';
import { WeekCalendar } from './WeekCalendar';

export default async function WeeklyPlanPage({
  params,
}: {
  params: Promise<{ weekStartDate: string }>;
}) {
  const session = await requireUser();
  const { weekStartDate } = await params;

  if (!isMondayInTz(weekStartDate, session.user.timezone)) notFound();

  const quarter = await ensureCurrentQuarter(session.user.id, session.user.timezone);
  const totalWeeksInQuarter = weeksInQuarter(quarter.startDate, quarter.endDate);
  const weekNumber = weekNumberWithinQuarter(weekStartDate, quarter);

  const queue = await getWeeklyPlanningQueue(session.user.id);
  const closed = await getClosedSessions(session.user.id, 'weekly', weekStartDate);
  const closedPriorityIds = new Set(
    closed.map((s) => s.priorityId).filter((v): v is string => !!v),
  );
  const currentPriority = queue.find((p) => !closedPriorityIds.has(p.id)) ?? null;

  // Snapshot data for WeekCalendar (always loaded).
  const week = daysInWeek(weekStartDate);
  const weekEndISO = week[week.length - 1] ?? weekStartDate;
  const [tasksByDay, eventsForWeek, calendarFeed, quarterFocus] = await Promise.all([
    Promise.all(week.map((d) => getTasksForDate(session.user.id, d))),
    getEventsForDateRange(session.user.id, weekStartDate, weekEndISO, session.user.timezone),
    getCalendarFeedEventsForRange(session.user.id, weekStartDate, weekEndISO, session.user.timezone),
    getQuarterWeekFocusForQuarter(session.user.id, quarter.id),
  ]);

  const priorityById = new Map(queue.map((p) => [p.id, p]));

  // Bootstrap chat session for current priority.
  let initialMessages: WeeklyChatPanelInitial['initialMessages'] = [];
  let sessionId: string | null = null;
  let quarterFocusLabel: string | null = null;
  if (currentPriority) {
    const chatSession = await getOrCreateSession({
      userId: session.user.id,
      sessionType: 'weekly',
      contextRef: weekStartDate,
      priorityId: currentPriority.id,
    });
    sessionId = chatSession.id;
    const thread = await loadThread(chatSession.id);
    initialMessages = thread
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m): { role: 'user' | 'assistant'; text: string } => {
        if (typeof m.content === 'string') {
          return { role: m.role as 'user' | 'assistant', text: m.content };
        }
        const text = extractAssistantText(m.content as ContentBlockParam[]);
        return { role: m.role as 'user' | 'assistant', text };
      })
      .filter((m) => m.text.trim().length > 0);

    const focusForThisWeek = quarterFocus.find(
      (f) => f.priorityId === currentPriority.id && f.weekNumber === weekNumber,
    );
    quarterFocusLabel = focusForThisWeek?.focusLabel ?? null;
  }

  const initial: WeeklyChatPanelInitial = {
    sessionId,
    currentPriority: currentPriority
      ? { id: currentPriority.id, name: currentPriority.name, color: currentPriority.icon.color }
      : null,
    weekRangeLabel: weekRangeLabel(weekStartDate, session.user.timezone),
    quarterFocusLabel,
    initialMessages,
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Plan week of {weekRangeLabel(weekStartDate, session.user.timezone)}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {quarter.quarterLabel} · week {weekNumber} of {totalWeeksInQuarter}
            {quarter.isPartial ? ' (partial quarter)' : ''}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {session.user.email}
          </p>
        </div>
        <Link
          href="/priorities"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Council
        </Link>
      </header>

      <QueuePanel
        priorities={queue}
        currentPriorityId={currentPriority?.id ?? null}
        donePriorityIds={closedPriorityIds}
      />

      <ChatPanel initial={initial} />

      <WeekCalendar
        weekStartISO={weekStartDate}
        userTimezone={session.user.timezone}
        tasksByDay={tasksByDay}
        eventsForWeek={eventsForWeek}
        calendarFeed={calendarFeed}
        quarterFocus={quarterFocus}
        weekNumberInQuarter={weekNumber}
        priorityById={priorityById}
      />

      <EndSessionPlaceholder sessionId={sessionId} />
    </main>
  );
}
