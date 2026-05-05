import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Quarter } from '@/db/schema';
import { weekNumber, weeksInQuarter } from '@/lib/quarters';
import { currentDateInTz } from '@/lib/quarters';

type Props = {
  quarter: Quarter;
  userTimezone: string;
};

export function QuarterCalendar({ quarter, userTimezone }: Props) {
  const totalWeeks = weeksInQuarter(quarter.startDate, quarter.endDate);
  const todayISO = currentDateInTz(userTimezone);
  const currentWeek = weekNumber(todayISO, quarter.startDate, totalWeeks);

  const start = parseISO(quarter.startDate);
  const end = parseISO(quarter.endDate);

  const rows = Array.from({ length: totalWeeks }, (_, i) => {
    const weekStart = addDays(start, i * 7);
    const weekEnd = addDays(start, i * 7 + 6);
    // Cap last-week end at quarter end_date for partial quarters.
    const cappedEnd = weekEnd > end ? end : weekEnd;
    return {
      n: i + 1,
      startISO: format(weekStart, 'yyyy-MM-dd'),
      endISO: format(cappedEnd, 'yyyy-MM-dd'),
      isCurrent: i + 1 === currentWeek,
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
        Each week will show its focus areas after the M12 chatbot conversation.
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
            <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              No focus set yet.
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
