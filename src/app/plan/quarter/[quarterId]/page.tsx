import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { loadThread, extractAssistantText } from '@/lib/chat-messages';
import { getClosedSessions, getOrCreateSession } from '@/lib/chat-sessions';
import { getQuarterlyPlanningQueue } from '@/lib/priorities';
import { getQuarterById, weeksInQuarter } from '@/lib/quarters';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { ChatPanel, type ChatPanelInitial } from './ChatPanel';
import { EndSessionPlaceholder } from './EndSessionPlaceholder';
import { QuarterCalendar } from './QuarterCalendar';
import { QueuePanel } from './QueuePanel';

export default async function QuarterPlanPage({
  params,
}: {
  params: Promise<{ quarterId: string }>;
}) {
  const session = await requireUser();
  const { quarterId } = await params;

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
  const currentPriority = queue.find((p) => !closedPriorityIds.has(p.id)) ?? null;

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

      <QueuePanel priorities={queue} />

      <ChatPanel initial={initial} quarterId={quarterId} />

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
