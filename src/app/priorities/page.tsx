import Link from 'next/link';
import { requireUser } from '@/auth';
import { getPrioritiesForUser } from '@/lib/priorities';
import {
  currentDateInTz,
  ensureCurrentQuarter,
  weekNumber,
  weeksInQuarter,
} from '@/lib/quarters';
import { PrioritiesList } from './PrioritiesList';

type SearchParams = { [key: string]: string | string[] | undefined };

const TOAST_COPY: Record<string, { tone: 'success' | 'error'; message: string }> = {
  created: { tone: 'success', message: 'Priority created.' },
  saved: { tone: 'success', message: 'Saved.' },
  deleted: { tone: 'success', message: 'Priority deleted.' },
  not_found: { tone: 'error', message: 'That Priority could not be found.' },
};

export default async function CouncilHomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const sp = await searchParams;
  const showArchived = sp.archived === '1';
  const [all, quarter] = await Promise.all([
    getPrioritiesForUser(session.user.id, { includeArchived: showArchived }),
    ensureCurrentQuarter(session.user.id, session.user.timezone),
  ]);

  const todayISO = currentDateInTz(session.user.timezone);
  const totalWeeks = weeksInQuarter(quarter.startDate, quarter.endDate);
  const week = weekNumber(todayISO, quarter.startDate, totalWeeks);
  const quarterHeader = `${quarter.quarterLabel} · week ${week} of ${totalWeeks}${
    quarter.isPartial ? ' (partial)' : ''
  }`;

  // Toast on success/error query params from form-post redirects.
  const toast = (() => {
    for (const key of Object.keys(TOAST_COPY)) {
      if (sp[key] === '1') return TOAST_COPY[key];
    }
    if (typeof sp.error === 'string') {
      return TOAST_COPY[sp.error] ?? { tone: 'error', message: 'Something went wrong.' };
    }
    return null;
  })();

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Council</h1>
          <p className="mt-1 text-xs text-muted-foreground">{quarterHeader}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{session.user.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/today"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Today
          </Link>
          <Link
            href="/plan/quarter"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Plan Quarter
          </Link>
          <Link
            href="/plan/week"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Plan Week
          </Link>
          <Link
            href="/plan/day"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Plan Day
          </Link>
          <Link
            href="/settings/profile"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Settings
          </Link>
          <form method="post" action="/api/auth/signout">
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {toast ? (
        <div
          role="status"
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            toast.tone === 'success'
              ? 'border-green-600/30 bg-green-600/5 text-green-700'
              : 'border-red-600/30 bg-red-600/5 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {all.length} {all.length === 1 ? 'Priority' : 'Priorities'}
          {showArchived ? ' (including archived)' : ''}
        </p>
        <Link
          href={showArchived ? '/priorities' : '/priorities?archived=1'}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Link>
      </div>

      <section className="mt-3">
        <PrioritiesList key={showArchived ? 'archived' : 'active'} initial={all} />
      </section>

      <div className="mt-6 flex justify-center">
        <Link
          href="/priorities/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Create Priority
        </Link>
      </div>
    </main>
  );
}
