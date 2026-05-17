import Link from 'next/link';
import { requireUser } from '@/auth';
import { findCalendarConflicts } from '@/lib/calendar-conflicts';

export default async function ConflictsPage() {
  const session = await requireUser();
  // Sync first so the list reflects the latest external calendar state.
  const conflicts = await findCalendarConflicts(
    session.user.id,
    session.user.timezone,
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Calendar conflicts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            External calendar events are immovable and take precedence.
            These planned items overlap a synced calendar event — adjust
            the planned item (open its Priority, or ask Master Chat to
            reschedule it).
          </p>
        </div>
        <Link
          href="/today"
          className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground"
        >
          ← Today
        </Link>
      </header>

      {conflicts.length === 0 ? (
        <div className="rounded-md border border-green-600/30 bg-green-600/5 px-4 py-6 text-center text-sm text-green-700">
          No conflicts — your plan fits around your calendar.
        </div>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c, i) => (
            <li
              key={`${c.itemId}-${i}`}
              className="space-y-2 rounded-md border border-red-600/30 bg-red-600/5 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: c.priorityColor }}
                />
                <span className="text-sm font-medium">{c.itemTitle}</span>
                <span className="text-xs text-muted-foreground">
                  · {c.priorityName} · {c.kind}
                </span>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">
                  Planned: <span className="text-foreground">{c.itemRange}</span>
                </div>
                <div className="text-red-700">
                  Calendar (immovable):{' '}
                  <span className="font-medium">{c.calendarTitle}</span> —{' '}
                  {c.calendarRange}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/chat?from=${encodeURIComponent('/conflicts')}`}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  Ask Master Chat to reschedule
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Guided one-tap conflict resolution lands in a follow-up (M21). For
        now, reschedule the planned item via Master Chat or its Priority.
      </p>
    </main>
  );
}
