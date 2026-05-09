import Link from 'next/link';
import { requireUser } from '@/auth';
import { currentDateInTz } from '@/lib/quarters';
import { fetchDailyData } from './dailyDataFetch';
import { DailyTimeline } from './DailyTimeline';
import { DateNavigator } from './DateNavigator';
import { UnscheduledTasksSection } from './UnscheduledTasksSection';

type SearchParams = { [key: string]: string | string[] | undefined };

const TOAST_COPY: Record<string, { tone: 'success' | 'error'; message: string }> = {
  task_saved: { tone: 'success', message: 'Task saved.' },
  task_deleted: { tone: 'success', message: 'Task deleted.' },
  task_completed: { tone: 'success', message: 'Task updated.' },
  event_saved: { tone: 'success', message: 'Event saved.' },
  event_deleted: { tone: 'success', message: 'Event deleted.' },
  feeds_synced: { tone: 'success', message: 'Calendar feeds synced.' },
  validation_failed: {
    tone: 'error',
    message: "Some fields weren't valid. Check the values and try again.",
  },
  save_failed: {
    tone: 'error',
    message: "We couldn't save your changes. Try again in a moment.",
  },
  sync_failed: { tone: 'error', message: 'Calendar sync failed.' },
  not_found: { tone: 'error', message: 'That item could not be found.' },
};

function pickDate(sp: SearchParams, fallback: string): string {
  const raw = sp.date;
  if (typeof raw !== 'string') return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const sp = await searchParams;

  const tz = session.user.timezone;
  const todayISO = currentDateInTz(tz);
  const dateISO = pickDate(sp, todayISO);

  const data = await fetchDailyData(session.user.id, dateISO, tz);

  const toast = (() => {
    for (const key of Object.keys(TOAST_COPY)) {
      if (sp[key] === '1') return TOAST_COPY[key];
    }
    if (typeof sp.error === 'string') {
      const base = TOAST_COPY[sp.error] ?? {
        tone: 'error' as const,
        message: 'Something went wrong.',
      };
      const detail = typeof sp.validation_issue === 'string' ? sp.validation_issue : '';
      return detail ? { tone: base.tone, message: `${base.message} (${detail})` } : base;
    }
    return null;
  })();

  const redirectBack = sp.date ? `/today?date=${dateISO}` : `/today`;
  const totalItems = data.timelineItems.length + data.unscheduledTasks.length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Signed in as {session.user.email}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            href="/plan/day"
            className="text-sm font-medium text-primary hover:opacity-80"
          >
            Plan tomorrow →
          </Link>
          <Link
            href="/priorities"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Council →
          </Link>
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Settings
          </Link>
          <form method="post" action="/api/calendar-feeds/sync-all">
            <input type="hidden" name="_redirect" value={redirectBack} />
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
              title="Refresh all calendar feeds"
            >
              ↻ Sync calendars
            </button>
          </form>
        </div>
      </header>

      <DateNavigator currentISO={dateISO} todayISO={todayISO} />

      {toast ? (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.tone === 'success'
              ? 'border-green-600/30 bg-green-600/5 text-green-700'
              : 'border-red-600/30 bg-red-600/5 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {totalItems === 0 ? (
        <EmptyDay isToday={dateISO === todayISO} isPast={dateISO < todayISO} />
      ) : (
        <>
          <DailyTimeline
            items={data.timelineItems}
            userTimezone={tz}
            redirectBack={redirectBack}
          />
          <UnscheduledTasksSection items={data.unscheduledTasks} redirectBack={redirectBack} />
        </>
      )}
    </main>
  );
}

function EmptyDay({ isToday, isPast }: { isToday: boolean; isPast: boolean }) {
  const message = isToday
    ? 'Nothing scheduled for today. Open the Council to add tasks or events.'
    : isPast
      ? 'No tasks or events for this day.'
      : 'Nothing scheduled yet for this day.';
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
