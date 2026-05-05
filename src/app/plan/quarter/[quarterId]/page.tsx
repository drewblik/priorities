import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getQuarterlyPlanningQueue } from '@/lib/priorities';
import { getQuarterById } from '@/lib/quarters';
import { ChatPlaceholder } from './ChatPlaceholder';
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

  const headerLabel = `${quarter.quarterLabel}${quarter.isPartial ? ' · partial' : ''}${
    quarter.status === 'closed' ? ' · closed' : ''
  }`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan {quarter.quarterLabel}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{headerLabel}</p>
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

      <p className="rounded-md border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-700">
        Static scaffold for now — the Quarter Planning chatbot wires up in M12.
        Use this page to confirm the layout and queue scoping.
      </p>

      <QueuePanel priorities={queue} />

      <ChatPlaceholder firstPriority={queue[0] ?? null} />

      <QuarterCalendar quarter={quarter} userTimezone={session.user.timezone} />

      <EndSessionPlaceholder />
    </main>
  );
}
