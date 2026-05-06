import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type {
  CalendarFeedEvent,
  Event,
  Priority,
  QuarterWeekFocus,
  Task,
} from '@/db/schema';
import type { DisplayedEvent, DisplayedTask } from '@/lib/recurrence';

type Props = {
  weekStartISO: string;
  userTimezone: string;
  tasksByDay: DisplayedTask[][];
  eventsForWeek: DisplayedEvent[];
  calendarFeed: CalendarFeedEvent[];
  quarterFocus: QuarterWeekFocus[];
  weekNumberInQuarter: number;
  priorityById: Map<string, Priority>;
};

export function WeekCalendar({
  weekStartISO,
  userTimezone,
  tasksByDay,
  eventsForWeek,
  calendarFeed,
  quarterFocus,
  weekNumberInQuarter,
  priorityById,
}: Props) {
  const start = parseISO(weekStartISO);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return {
      iso: format(d, 'yyyy-MM-dd'),
      label: formatInTimeZone(new Date(`${format(d, 'yyyy-MM-dd')}T12:00:00.000Z`), userTimezone, 'EEE'),
      dateLabel: formatInTimeZone(new Date(`${format(d, 'yyyy-MM-dd')}T12:00:00.000Z`), userTimezone, 'LLL d'),
    };
  });

  const eventsByDay = new Map<string, DisplayedEvent[]>();
  for (const e of eventsForWeek) {
    const day = formatInTimeZone(e.startTime, userTimezone, 'yyyy-MM-dd');
    const list = eventsByDay.get(day) ?? [];
    list.push(e);
    eventsByDay.set(day, list);
  }
  const feedByDay = new Map<string, CalendarFeedEvent[]>();
  for (const f of calendarFeed) {
    const day = f.allDay
      ? f.startTime.toISOString().slice(0, 10)
      : formatInTimeZone(f.startTime, userTimezone, 'yyyy-MM-dd');
    const list = feedByDay.get(day) ?? [];
    list.push(f);
    feedByDay.set(day, list);
  }

  const focusForThisWeek = quarterFocus.filter((f) => f.weekNumber === weekNumberInQuarter);

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Week — {formatInTimeZone(new Date(`${weekStartISO}T12:00:00.000Z`), userTimezone, 'LLL d')} – {formatInTimeZone(new Date(`${days[6]?.iso}T12:00:00.000Z`), userTimezone, 'LLL d')}
      </summary>

      {focusForThisWeek.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-primary">
            Quarter focus
          </span>
          {focusForThisWeek.map((f) => {
            const p = priorityById.get(f.priorityId);
            return (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px]"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p?.icon.color ?? '#888' }}
                />
                {p?.name ?? '(deleted)'} · {f.focusLabel}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:grid sm:grid-cols-7 sm:gap-2">
        {days.map((d, i) => {
          const tasks = tasksByDay[i] ?? [];
          const events = eventsByDay.get(d.iso) ?? [];
          const feed = feedByDay.get(d.iso) ?? [];
          const empty = tasks.length === 0 && events.length === 0 && feed.length === 0;
          return (
            <div
              key={d.iso}
              className="rounded-md border border-border bg-background p-2"
            >
              <div className="text-xs">
                <span className="font-medium">{d.label}</span>{' '}
                <span className="text-muted-foreground">{d.dateLabel}</span>
              </div>
              {empty ? (
                <p className="mt-2 text-[11px] text-muted-foreground">—</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {events.map((e) => (
                    <li key={e.id}>
                      <Chip event={e} priorityById={priorityById} userTimezone={userTimezone} />
                    </li>
                  ))}
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <TaskChip task={t} priorityById={priorityById} userTimezone={userTimezone} />
                    </li>
                  ))}
                  {feed.map((f) => (
                    <li key={f.id}>
                      <FeedChip feed={f} userTimezone={userTimezone} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function Chip({
  event,
  priorityById,
  userTimezone,
}: {
  event: DisplayedEvent;
  priorityById: Map<string, Priority>;
  userTimezone: string;
}) {
  const p = priorityById.get(event.ownerPriorityId);
  const time = formatInTimeZone(event.startTime, userTimezone, 'h:mm a');
  return (
    <div className="flex items-start gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-[11px]">
      <span
        aria-hidden="true"
        className="mt-0.5 h-2 w-2 flex-none rounded-full"
        style={{ backgroundColor: p?.icon.color ?? '#888' }}
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{event.title}</span>{' '}
        <span className="text-muted-foreground">· {time}</span>
      </span>
    </div>
  );
}

function TaskChip({
  task,
  priorityById,
  userTimezone,
}: {
  task: Task & { kind?: string };
  priorityById: Map<string, Priority>;
  userTimezone: string;
}) {
  const p = priorityById.get(task.ownerPriorityId);
  const block =
    task.timeBlockStart && task.timeBlockEnd
      ? formatInTimeZone(task.timeBlockStart, userTimezone, 'h:mm a')
      : null;
  return (
    <div className="flex items-start gap-1 rounded border border-border bg-background px-2 py-1 text-[11px]">
      <span
        aria-hidden="true"
        className="mt-0.5 h-2 w-2 flex-none rounded-full"
        style={{ backgroundColor: p?.icon.color ?? '#888' }}
      />
      <span className="min-w-0 flex-1 truncate">
        {block ? <span className="text-muted-foreground">{block} </span> : null}
        <span>{task.title}</span>
      </span>
    </div>
  );
}

function FeedChip({ feed, userTimezone }: { feed: CalendarFeedEvent; userTimezone: string }) {
  const time = feed.allDay
    ? 'All day'
    : formatInTimeZone(feed.startTime, userTimezone, 'h:mm a');
  return (
    <div className="flex items-start gap-1 rounded border border-border bg-muted/40 px-2 py-1 text-[11px] italic text-muted-foreground">
      <span
        aria-hidden="true"
        className="mt-0.5 h-2 w-2 flex-none rounded-full bg-muted-foreground/50"
      />
      <span className="min-w-0 flex-1 truncate">
        {feed.title} · {time}
      </span>
    </div>
  );
}
