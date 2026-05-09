import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import type { Event, Priority, Task } from '@/db/schema';
import { dayLabel, tomorrowInTz } from '@/lib/daily-utils';
import { ProgressItemRow } from './ProgressItemRow';

type Item =
  | { kind: 'task'; task: Task }
  | { kind: 'event'; event: Event };

type ItemsByPriority = {
  priority: Priority;
  items: Item[];
};

type Props = {
  dateISO: string; // today (or whatever day we're reviewing)
  itemsByPriority: ItemsByPriority[];
  userTimezone: string;
  /** Where to redirect on submit. Usually `/plan/day/<tomorrow>?step=2`. */
  redirectAfter: string;
  saved: boolean;
  errorMessage: string | null;
};

export function ProgressStep({
  dateISO,
  itemsByPriority,
  userTimezone,
  redirectAfter,
  saved,
  errorMessage,
}: Props) {
  const tomorrow = tomorrowInTz(userTimezone);
  const totalItems = itemsByPriority.reduce((sum, g) => sum + g.items.length, 0);

  if (totalItems === 0) {
    return (
      <section className="rounded-md border border-border bg-background p-4">
        <h2 className="text-base font-medium">Step 1 — Progress check</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No tasks or events were scheduled for {dayLabel(dateISO, userTimezone)}.
          Nothing to review.
        </p>
        <div className="mt-3">
          <Link
            href={`/plan/day/${tomorrow}?step=2`}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continue →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-medium">
          Step 1 — Progress check ·{' '}
          <span className="font-normal text-muted-foreground">
            {dayLabel(dateISO, userTimezone)}
          </span>
        </h2>
        <Link
          href={`/plan/day/${tomorrow}?step=3`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Skip to planning →
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Mark today&apos;s items as Done, Skipped, or Moved before planning
        tomorrow.
      </p>

      {saved ? (
        <div
          className="mt-3 rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm text-green-700"
          role="status"
        >
          Progress saved.
        </div>
      ) : null}
      {errorMessage ? (
        <div
          className="mt-3 rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <form method="post" action="/api/plan/day/progress" className="mt-3 space-y-4">
        <input type="hidden" name="dateISO" value={dateISO} />
        <input type="hidden" name="_redirect" value={redirectAfter} />

        {itemsByPriority.map((group) => (
          <div key={group.priority.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 flex-none rounded-full"
                style={{ backgroundColor: group.priority.icon.color }}
              />
              <span className="text-sm font-medium">{group.priority.name}</span>
              <span className="text-xs text-muted-foreground">
                {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <ul className="space-y-2">
              {group.items.map((it) => {
                if (it.kind === 'task') {
                  const t = it.task;
                  const subtitle = t.timeBlockStart
                    ? `${formatInTimeZone(t.timeBlockStart, userTimezone, 'h:mm a')}–${formatInTimeZone(t.timeBlockEnd!, userTimezone, 'h:mm a')}`
                    : 'No time block';
                  return (
                    <ProgressItemRow
                      key={t.id}
                      itemRef={`task:${t.id}`}
                      title={t.title}
                      subtitle={subtitle}
                      defaultMoveDate={tomorrow}
                      allowMove={true}
                    />
                  );
                }
                const e = it.event;
                const subtitle = `${formatInTimeZone(e.startTime, userTimezone, 'h:mm a')}–${formatInTimeZone(e.endTime, userTimezone, 'h:mm a')}`;
                return (
                  <ProgressItemRow
                    key={e.id}
                    itemRef={`event:${e.id}`}
                    title={e.title}
                    subtitle={subtitle}
                    defaultMoveDate={tomorrow}
                    allowMove={false}
                  />
                );
              })}
            </ul>
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save and continue →
          </button>
          <Link
            href={`/plan/day/${tomorrow}?step=2`}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Skip without saving
          </Link>
        </div>
      </form>
    </section>
  );
}
