'use client';

import { useRouter } from 'next/navigation';
import { addDays, format, parseISO } from 'date-fns';

type Props = {
  currentISO: string;
  todayISO: string;
};

function shiftDate(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd');
}

export function DateNavigator({ currentISO, todayISO }: Props) {
  const router = useRouter();
  const prevISO = shiftDate(currentISO, -1);
  const nextISO = shiftDate(currentISO, 1);
  const isToday = currentISO === todayISO;

  const dayLabel = format(parseISO(currentISO), 'EEEE, LLL d, yyyy');

  return (
    <nav className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => router.push(`/today?date=${prevISO}`)}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        aria-label="Previous day"
      >
        ←
      </button>

      <div className="flex flex-1 flex-col">
        <span className="text-base font-semibold tracking-tight">{dayLabel}</span>
        {!isToday ? (
          <button
            type="button"
            onClick={() => router.push(`/today`)}
            className="self-start text-xs text-muted-foreground hover:text-foreground"
          >
            Jump to today
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Today</span>
        )}
      </div>

      <input
        type="date"
        value={currentISO}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) router.push(`/today?date=${v}`);
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
        aria-label="Pick a date"
      />

      <button
        type="button"
        onClick={() => router.push(`/today?date=${nextISO}`)}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        aria-label="Next day"
      >
        →
      </button>
    </nav>
  );
}
