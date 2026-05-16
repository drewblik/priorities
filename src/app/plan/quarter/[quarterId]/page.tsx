import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { syncDueFeedsForUser } from '@/lib/calendar-sync';
import { loadThread, extractAssistantText } from '@/lib/chat-messages';
import { getClosedSessions, getOrCreateSession } from '@/lib/chat-sessions';
import { getQuarterlyPlanningQueue } from '@/lib/priorities';
import { getQuarterById, weeksInQuarter } from '@/lib/quarters';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';
import { isHorizonComplete } from '@/lib/replan';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { ReplanModePicker } from '../../ReplanModePicker';
import { ChatPanel, type ChatPanelInitial } from './ChatPanel';
import { EndSessionPlaceholder } from './EndSessionPlaceholder';
import { QuarterCalendar } from './QuarterCalendar';
import { QueuePanel } from './QueuePanel';

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function QuarterPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ quarterId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  await syncDueFeedsForUser(session.user.id);
  const { quarterId } = await params;
  const sp = await searchParams;
  const adjustMode = sp.mode === 'adjust';

  const [quarter, queue] = await Promise.all([
    getQuarterById(session.user.id, quarterId),
    getQuarterlyPlanningQueue(session.user.id),
  ]);
  if (!quarter) notFound();

  // Compute queue state — which priorities have a closed quarter session.
  const closed = await getClosedSessions(session.user.id, 'quarter', quarterId);
  const closedPriorityIds = new Set(
    closed.map((s) => s.priorityId).filter((v): v is string => !!v),
  );

  // If the horizon is complete (every queue priority has a closed session),
  // surface the mode picker. In adjustMode we render the picker's hint copy
  // and the queue's Redo buttons; otherwise we still bootstrap a current
  // priority + chat for the normal resume flow.
  const horizonComplete = await isHorizonComplete(
    session.user.id,
    'quarter',
    quarterId,
    queue.map((p) => p.id),
  );

  const currentPriority =
    !horizonComplete || adjustMode
      ? queue.find((p) => !closedPriorityIds.has(p.id)) ?? null
      : null;

  // If there's a current priority, ensure a chat session exists for it and
  // load its thread for the ChatPanel.
  let initialMessages: ChatPanelInitial['initialMessages'] = [];
  let sessionId: string | null = null;
  if (currentPriority) {
    const chatSession = await getOrCreateSession({
      userId: session.user.id,
      sessionType: 'quarter',
      contextRef: quarterId,
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
  }

  // Quarter calendar + focus rows.
  const quarterWeekFocus = await getQuarterWeekFocusForQuarter(session.user.id, quarterId);
  const priorityById = new Map(queue.map((p) => [p.id, p]));

  const totalWeeks = weeksInQuarter(quarter.startDate, quarter.endDate);
  const initial: ChatPanelInitial = {
    sessionId,
    currentPriority: currentPriority
      ? { id: currentPriority.id, name: currentPriority.name, color: currentPriority.icon.color }
      : null,
    totalWeeks,
    initialMessages,
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan {quarter.quarterLabel}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {quarter.quarterLabel}
            {quarter.isPartial ? ' · partial' : ''}
            {quarter.status === 'closed' ? ' · closed' : ''}
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

      {horizonComplete ? (
        <ReplanModePicker
          sessionType="quarter"
          contextRef={quarterId}
          adjustMode={adjustMode}
        />
      ) : null}

      <QueuePanel
        priorities={queue}
        currentPriorityId={currentPriority?.id ?? null}
        donePriorityIds={closedPriorityIds}
        adjustMode={adjustMode}
        contextRef={quarterId}
      />

      {horizonComplete && !adjustMode ? null : (
        <>
          <ChatPanel initial={initial} quarterId={quarterId} />
        </>
      )}

      <QuarterCalendar
        quarter={quarter}
        userTimezone={session.user.timezone}
        quarterWeekFocus={quarterWeekFocus}
        priorityById={priorityById}
      />

      <EndSessionPlaceholder sessionId={sessionId} />
    </main>
  );
}
