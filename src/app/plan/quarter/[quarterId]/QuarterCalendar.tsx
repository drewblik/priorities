import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Priority, Quarter, QuarterWeekFocus } from '@/db/schema';
import { weekNumber, weeksInQuarter } from '@/lib/quarters';
import { currentDateInTz } from '@/lib/quarters';

type Props = {
  quarter: Quarter;
  userTimezone: string;
  quarterWeekFocus: QuarterWeekFocus[];
  priorityById: Map<string, Priority>;
};

export function QuarterCalendar({
  quarter,
  userTimezone,
  quarterWeekFocus,
  priorityById,
}: Props) {
  const totalWeeks = weeksInQuarter(quarter.startDate, quarter.endDate);
  const todayISO = currentDateInTz(userTimezone);
  const currentWeek = weekNumber(todayISO, quarter.startDate, totalWeeks);

  const start = parseISO(quarter.startDate);
  const end = parseISO(quarter.endDate);

  // Bucket focus rows by week_number for fast lookup.
  const focusByWeek = new Map<number, QuarterWeekFocus[]>();
  for (const row of quarterWeekFocus) {
    const list = focusByWeek.get(row.weekNumber) ?? [];
    list.push(row);
    focusByWeek.set(row.weekNumber, list);
  }

  const rows = Array.from({ length: totalWeeks }, (_, i) => {
    const weekStart = addDays(start, i * 7);
    const weekEnd = addDays(start, i * 7 + 6);
    const cappedEnd = weekEnd > end ? end : weekEnd;
    return {
      n: i + 1,
      startISO: format(weekStart, 'yyyy-MM-dd'),
      endISO: format(cappedEnd, 'yyyy-MM-dd'),
      isCurrent: i + 1 === currentWeek,
      focus: focusByWeek.get(i + 1) ?? [],
    };
  });

  const formatDay = (iso: string) =>
    formatInTimeZone(new Date(`${iso}T12:00:00.000Z`), userTimezone, 'EEE LLL d');

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        13-week calendar ({totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Focus areas appear here as the chatbot saves them via{' '}
        <span className="font-mono">set_week_focus</span>.
      </p>

      <ol className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.n}
            className={`rounded-md border bg-background p-3 ${
              row.isCurrent ? 'border-l-4 border-l-primary' : 'border-border'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Week {row.n}
              </span>
              <span className="text-muted-foreground">
                {formatDay(row.startISO)} – {formatDay(row.endISO)}
              </span>
              {row.isCurrent ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                  This week
                </span>
              ) : null}
            </div>
            {row.focus.length === 0 ? (
              <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                No focus set yet.
              </div>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1">
                {row.focus.map((f) => {
                  const p = priorityById.get(f.priorityId);
                  return (
                    <li
                      key={f.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p?.icon.color ?? '#888' }}
                      />
                      <span className="font-medium">{p?.name ?? '(deleted)'}</span>
                      <span className="text-muted-foreground">· {f.focusLabel}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
