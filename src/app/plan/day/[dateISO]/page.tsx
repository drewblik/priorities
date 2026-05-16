import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { syncDueFeedsForUser } from '@/lib/calendar-sync';
import { extractAssistantText, loadThread } from '@/lib/chat-messages';
import { getClosedSessions, getOrCreateSession } from '@/lib/chat-sessions';
import { loadDayCalendarSnapshot } from '@/lib/daily-context';
import {
  dayLabel,
  dayUtcBounds,
  isIsoDate,
  todayInTz,
} from '@/lib/daily-utils';
import { getEventsForDateRange } from '@/lib/events';
import { getDailyPlanningQueue, getPrioritiesForUser } from '@/lib/priorities';
import { isHorizonComplete } from '@/lib/replan';
import { getTasksForDate } from '@/lib/tasks';
import type { Event, Priority, Task } from '@/db/schema';
import { ReplanModePicker } from '../../ReplanModePicker';
import { ChatPanel, type DailyChatPanelInitial } from './ChatPanel';
import { CaptureStepPlaceholder } from './CaptureStepPlaceholder';
import { DayCalendar } from './DayCalendar';
import { EndSessionPlaceholder } from './EndSessionPlaceholder';
import { ProgressStep } from './ProgressStep';
import { QueuePanel } from './QueuePanel';
import { StepNavigator } from './StepNavigator';

type SearchParams = { [key: string]: string | string[] | undefined };

const PROGRESS_ERROR_COPY: Record<string, string> = {
  validation_failed: 'Some entries looked off — check your selections and try again.',
  progress_partial: 'Some items couldn\'t be saved. Try again on the failed ones.',
};

export default async function DailyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ dateISO: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  await syncDueFeedsForUser(session.user.id);
  const { dateISO } = await params;
  if (!isIsoDate(dateISO)) notFound();

  const sp = await searchParams;
  const stepRaw = typeof sp.step === 'string' ? sp.step : '1';
  const currentStep: 1 | 2 | 3 =
    stepRaw === '2' ? 2 : stepRaw === '3' ? 3 : 1;

  const today = todayInTz(session.user.timezone);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Daily Plan
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Planning day: {dayLabel(dateISO, session.user.timezone)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {session.user.email}
          </p>
        </div>
        <Link
          href="/today"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Today
        </Link>
      </header>

      <StepNavigator dateISO={dateISO} currentStep={currentStep} />

      {currentStep === 1 ? (
        <Step1
          userId={session.user.id}
          userTimezone={session.user.timezone}
          reviewDate={today}
          planningDate={dateISO}
          progressSaved={sp.progress_saved === '1'}
          errorMessage={
            typeof sp.error === 'string' ? PROGRESS_ERROR_COPY[sp.error] ?? null : null
          }
          failedRefs={typeof sp.failed === 'string' ? sp.failed : null}
        />
      ) : null}

      {currentStep === 2 ? <CaptureStepPlaceholder dateISO={dateISO} /> : null}

      {currentStep === 3 ? (
        <Step3
          userId={session.user.id}
          userTimezone={session.user.timezone}
          dateISO={dateISO}
          userName={session.user.name ?? null}
          userEmail={session.user.email}
          adjustMode={sp.mode === 'adjust'}
        />
      ) : null}
    </main>
  );
}

async function Step1({
  userId,
  userTimezone,
  reviewDate,
  planningDate,
  progressSaved,
  errorMessage,
  failedRefs,
}: {
  userId: string;
  userTimezone: string;
  reviewDate: string;
  planningDate: string;
  progressSaved: boolean;
  errorMessage: string | null;
  failedRefs: string | null;
}) {
  // Today's items grouped by Priority. Tasks: target_date=today (drops virtual
  // instances we'd otherwise need to materialize — past target dates without
  // an override are by design open). Events: start_time on today.
  const [tasksToday, eventsToday, allPriorities] = await Promise.all([
    getTasksForDate(userId, reviewDate),
    getEventsForDateRange(userId, reviewDate, reviewDate, userTimezone),
    getPrioritiesForUser(userId),
  ]);

  const priorityById = new Map(allPriorities.map((p) => [p.id, p]));
  const groups = new Map<string, { priority: Priority; tasks: Task[]; events: Event[] }>();
  for (const t of tasksToday) {
    // Virtual recurring instances are skipped — they materialize into real
    // rows on first interaction (M9 pattern). For the progress check we only
    // surface concrete rows that already have a row in the DB.
    if (t.kind === 'virtual') continue;
    if (t.status !== 'open') continue;
    const p = priorityById.get(t.ownerPriorityId);
    if (!p) continue;
    const g = groups.get(p.id) ?? { priority: p, tasks: [], events: [] };
    g.tasks.push(t);
    groups.set(p.id, g);
  }
  for (const e of eventsToday) {
    if (e.kind === 'virtual') continue;
    if (e.completionStatus !== null) continue;
    const p = priorityById.get(e.ownerPriorityId);
    if (!p) continue;
    const g = groups.get(p.id) ?? { priority: p, tasks: [], events: [] };
    g.events.push(e);
    groups.set(p.id, g);
  }

  const itemsByPriority = Array.from(groups.values())
    .filter((g) => g.tasks.length + g.events.length > 0)
    .sort((a, b) => a.priority.position - b.priority.position)
    .map((g) => ({
      priority: g.priority,
      items: [
        ...g.tasks.map((t) => ({ kind: 'task' as const, task: t })),
        ...g.events.map((e) => ({ kind: 'event' as const, event: e })),
      ],
    }));

  const composedError =
    errorMessage && failedRefs
      ? `${errorMessage} Failed: ${failedRefs}.`
      : errorMessage;

  return (
    <ProgressStep
      dateISO={reviewDate}
      itemsByPriority={itemsByPriority}
      userTimezone={userTimezone}
      redirectAfter={`/plan/day/${planningDate}?step=2`}
      saved={progressSaved}
      errorMessage={composedError}
    />
  );
}

async function Step3({
  userId,
  userTimezone,
  dateISO,
  userName,
  userEmail,
  adjustMode,
}: {
  userId: string;
  userTimezone: string;
  dateISO: string;
  userName: string | null;
  userEmail: string;
  adjustMode: boolean;
}) {
  // Suppress lint about unused params (carried for future M15 re-planning hooks).
  void userName;
  void userEmail;

  const queue = await getDailyPlanningQueue(userId);
  const closed = await getClosedSessions(userId, 'daily', dateISO);
  const closedPriorityIds = new Set(
    closed.map((s) => s.priorityId).filter((v): v is string => !!v),
  );
  const horizonComplete = await isHorizonComplete(
    userId,
    'daily',
    dateISO,
    queue.map((p) => p.id),
  );
  const currentPriority =
    !horizonComplete || adjustMode
      ? queue.find((p) => !closedPriorityIds.has(p.id)) ?? null
      : null;

  // Snapshot data for the calendar (always loaded).
  const snapshot = await loadDayCalendarSnapshot({ userId, dateISO, userTimezone });

  // Bootstrap chat session for current priority.
  let initialMessages: DailyChatPanelInitial['initialMessages'] = [];
  let sessionId: string | null = null;
  let taskCount = 0;
  if (currentPriority) {
    const chatSession = await getOrCreateSession({
      userId,
      sessionType: 'daily',
      contextRef: dateISO,
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

    // Count untimed tasks for this priority on `dateISO` for the opener.
    const { startUtc, endUtc } = dayUtcBounds(dateISO, userTimezone);
    void startUtc;
    void endUtc;
    taskCount = snapshot.taskRows.filter(
      (r) =>
        r.priorityId === currentPriority.id &&
        !r.task.timeBlockStart &&
        r.task.targetDate === dateISO,
    ).length;
  }

  const initial: DailyChatPanelInitial = {
    sessionId,
    currentPriority: currentPriority
      ? {
          id: currentPriority.id,
          name: currentPriority.name,
          color: currentPriority.icon.color,
        }
      : null,
    dateLabel: dayLabel(dateISO, userTimezone),
    taskCount,
    initialMessages,
  };

  return (
    <>
      {horizonComplete ? (
        <ReplanModePicker
          sessionType="daily"
          contextRef={dateISO}
          adjustMode={adjustMode}
        />
      ) : null}

      <QueuePanel
        priorities={queue}
        currentPriorityId={currentPriority?.id ?? null}
        donePriorityIds={closedPriorityIds}
        adjustMode={adjustMode}
        contextRef={dateISO}
      />

      {horizonComplete && !adjustMode ? null : <ChatPanel initial={initial} />}

      <DayCalendar
        dateISO={dateISO}
        userTimezone={userTimezone}
        taskRows={snapshot.taskRows.map((r) => ({
          task: r.task,
          priorityName: r.priorityName,
          priorityColor: r.priorityIcon.color,
        }))}
        eventRows={snapshot.eventRows.map((r) => ({
          event: r.event,
          priorityName: r.priorityName,
          priorityColor: r.priorityIcon.color,
        }))}
        calendarFeedEvents={snapshot.calendarFeed}
        highlightedPriorityId={currentPriority?.id ?? null}
      />

      <EndSessionPlaceholder sessionId={sessionId} />
    </>
  );
}
