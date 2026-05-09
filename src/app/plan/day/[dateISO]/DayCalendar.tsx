import { formatInTimeZone } from 'date-fns-tz';
import type { CalendarFeedEvent, Event, Priority, Task } from '@/db/schema';
import { dayLabel, dayUtcBounds } from '@/lib/daily-utils';

type TaskRow = {
  task: Task;
  priorityName: string;
  priorityColor: string;
};
type EventRow = {
  event: Event;
  priorityName: string;
  priorityColor: string;
};

type Props = {
  dateISO: string;
  userTimezone: string;
  taskRows: TaskRow[];
  eventRows: EventRow[];
  calendarFeedEvents: CalendarFeedEvent[];
  /** Optional priority that's currently being planned. Their items get a
   *  slightly bolder treatment so the user can see what's "live". */
  highlightedPriorityId?: string | null;
};

/**
 * Mobile-first hourly grid 6am–midnight. Each hour row is 60px tall so a
 * 30-minute block renders as 30px. Items are absolutely positioned within
 * their starting hour-row by minute offset. Items spanning multiple hours
 * stretch by setting `height` to `(durationMinutes) * 1px` (since 1 minute
 * = 1 px at our 60px/hour scale).
 *
 * Items earlier than 6am or later than midnight get clipped onto the first
 * or last row with a small "Earlier" / "Later" hint. This keeps the grid
 * compact for the common case; v1.5 can add scroll-to-extend if needed.
 */
export function DayCalendar({
  dateISO,
  userTimezone,
  taskRows,
  eventRows,
  calendarFeedEvents,
  highlightedPriorityId = null,
}: Props) {
  const { startUtc, endUtc } = dayUtcBounds(dateISO, userTimezone);
  const dayStartMs = startUtc.getTime();
  const dayEndMs = endUtc.getTime();

  const FIRST_HOUR = 6;
  const HOURS_VISIBLE = 18; // 6am through midnight (6..23, last block goes to 24:00)
  const PX_PER_MIN = 1; // 60px per hour
  const HOUR_HEIGHT = 60;
  const MS_PER_MIN = 60 * 1000;

  const blocks: Array<{
    key: string;
    kind: 'task' | 'event' | 'feedEvent';
    title: string;
    color: string;
    isFeedAllDay: boolean;
    topPx: number;
    heightPx: number;
    startLabel: string;
    endLabel: string;
    priorityName: string;
    isHighlighted: boolean;
  }> = [];

  function pushBlock(args: {
    key: string;
    kind: 'task' | 'event' | 'feedEvent';
    title: string;
    color: string;
    isFeedAllDay?: boolean;
    startUtc: Date;
    endUtc: Date;
    priorityName: string;
    isHighlighted: boolean;
  }) {
    const startMs = Math.max(args.startUtc.getTime(), dayStartMs);
    const endMs = Math.min(args.endUtc.getTime(), dayEndMs);
    if (endMs <= startMs) return;

    // Compute minutes from start of day, then offset within FIRST_HOUR window.
    const startMinFromMidnight =
      (startMs - dayStartMs) / MS_PER_MIN;
    const endMinFromMidnight = (endMs - dayStartMs) / MS_PER_MIN;
    const visibleStartMin = Math.max(startMinFromMidnight, FIRST_HOUR * 60);
    const visibleEndMin = Math.min(endMinFromMidnight, (FIRST_HOUR + HOURS_VISIBLE) * 60);
    if (visibleEndMin <= visibleStartMin) return;

    const topPx = (visibleStartMin - FIRST_HOUR * 60) * PX_PER_MIN;
    const heightPx = Math.max(20, (visibleEndMin - visibleStartMin) * PX_PER_MIN);

    blocks.push({
      key: args.key,
      kind: args.kind,
      title: args.title,
      color: args.color,
      isFeedAllDay: !!args.isFeedAllDay,
      topPx,
      heightPx,
      startLabel: formatInTimeZone(args.startUtc, userTimezone, 'h:mm a'),
      endLabel: formatInTimeZone(args.endUtc, userTimezone, 'h:mm a'),
      priorityName: args.priorityName,
      isHighlighted: args.isHighlighted,
    });
  }

  for (const row of taskRows) {
    if (!row.task.timeBlockStart || !row.task.timeBlockEnd) continue;
    pushBlock({
      key: `task:${row.task.id}`,
      kind: 'task',
      title: row.task.title,
      color: row.priorityColor,
      startUtc: row.task.timeBlockStart,
      endUtc: row.task.timeBlockEnd,
      priorityName: row.priorityName,
      isHighlighted: highlightedPriorityId !== null && row.task.ownerPriorityId === highlightedPriorityId,
    });
  }
  for (const row of eventRows) {
    pushBlock({
      key: `event:${row.event.id}`,
      kind: 'event',
      title: row.event.title,
      color: row.priorityColor,
      startUtc: row.event.startTime,
      endUtc: row.event.endTime,
      priorityName: row.priorityName,
      isHighlighted: highlightedPriorityId !== null && row.event.ownerPriorityId === highlightedPriorityId,
    });
  }
  for (const fe of calendarFeedEvents) {
    pushBlock({
      key: `feed:${fe.id}`,
      kind: 'feedEvent',
      title: fe.title,
      color: '#9ca3af', // neutral gray
      isFeedAllDay: fe.allDay,
      startUtc: fe.startTime,
      endUtc: fe.endTime,
      priorityName: 'Calendar',
      isHighlighted: false,
    });
  }

  // Untimed (target_date=tomorrow but no time block) tasks go in a separate
  // strip below the grid so the chatbot's job is visible.
  const untimedTasks = taskRows.filter((r) => !r.task.timeBlockStart);

  // Filter feed events that are all-day (don't fit on the timeline).
  const allDayFeed = calendarFeedEvents.filter((fe) => fe.allDay);

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Day calendar — {dayLabel(dateISO, userTimezone)}
      </summary>

      {allDayFeed.length > 0 ? (
        <div className="mt-3 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">All day</div>
          {allDayFeed.map((fe) => (
            <div
              key={fe.id}
              className="rounded-md border-l-4 border-gray-400 bg-muted/40 px-2 py-1 text-xs italic text-muted-foreground"
            >
              {fe.title}
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="relative mt-3 overflow-x-auto rounded-md border border-border"
        style={{ height: HOURS_VISIBLE * HOUR_HEIGHT + 'px' }}
      >
        {/* Hour rows (gridlines + labels) */}
        <div className="absolute inset-0 flex flex-col">
          {Array.from({ length: HOURS_VISIBLE }, (_, i) => {
            const hour = FIRST_HOUR + i;
            const label = formatHourLabel(hour);
            return (
              <div
                key={hour}
                className="flex border-t border-border first:border-t-0"
                style={{ height: HOUR_HEIGHT + 'px' }}
              >
                <div className="w-12 flex-none border-r border-border bg-muted/20 px-1 pt-1 text-[10px] text-muted-foreground">
                  {label}
                </div>
                <div className="flex-1" />
              </div>
            );
          })}
        </div>

        {/* Blocks (absolute positioned over the gridlines, offset by label gutter) */}
        <div className="absolute inset-y-0 left-12 right-0">
          {blocks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No items time-blocked yet for this day.
            </div>
          ) : (
            blocks.map((b) => {
              const isFeed = b.kind === 'feedEvent';
              const borderColor = isFeed ? '#9ca3af' : b.color;
              const bgClass = isFeed ? 'bg-muted/40' : 'bg-background';
              const textColor = isFeed ? 'text-muted-foreground italic' : 'text-foreground';
              const ringClass = b.isHighlighted ? 'ring-2 ring-primary ring-offset-1' : '';
              return (
                <div
                  key={b.key}
                  className={`absolute left-1 right-1 overflow-hidden rounded-md border-l-4 ${bgClass} ${textColor} ${ringClass} px-2 py-1 text-xs shadow-sm`}
                  style={{
                    top: b.topPx + 'px',
                    height: b.heightPx + 'px',
                    borderLeftColor: borderColor,
                    borderTop: '1px solid rgb(0 0 0 / 0.05)',
                    borderRight: '1px solid rgb(0 0 0 / 0.05)',
                    borderBottom: '1px solid rgb(0 0 0 / 0.05)',
                  }}
                >
                  <div className="truncate font-medium">{b.title}</div>
                  <div className="truncate opacity-70">
                    {b.startLabel}–{b.endLabel} · {b.priorityName}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {untimedTasks.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Not yet time-blocked ({untimedTasks.length})
          </div>
          <ul className="space-y-1">
            {untimedTasks.map((row) => (
              <li
                key={row.task.id}
                className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ backgroundColor: row.priorityColor }}
                />
                <span className="truncate font-medium">{row.task.title}</span>
                <span className="text-muted-foreground">· {row.priorityName}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}
