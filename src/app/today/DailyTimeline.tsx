import { recurrenceLabel, timeRangeOnly } from '@/lib/task-event-format';
import type { TimelineItem } from './dailyDataFetch';
import { DailyTimelineRow } from './DailyTimelineRow';

type Props = {
  items: TimelineItem[];
  userTimezone: string;
  redirectBack: string;
};

export function DailyTimeline({ items, userTimezone, redirectBack }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Timeline
      </h2>
      <ul className="space-y-2">
        {items.map((item) => {
          if (item.kind === 'task') {
            const t = item.task;
            return (
              <li key={t.id}>
                <DailyTimelineRow
                  kind="task"
                  id={t.id}
                  ownerPriorityId={t.ownerPriorityId}
                  title={t.title}
                  description={t.description}
                  status={(t.status as 'open' | 'done' | 'skipped') ?? 'open'}
                  timeRange={
                    t.timeBlockStart && t.timeBlockEnd
                      ? timeRangeOnly(t.timeBlockStart, t.timeBlockEnd, userTimezone)
                      : null
                  }
                  recurrenceLabel={recurrenceLabel(t.recurrence)}
                  isVirtual={t.kind === 'virtual'}
                  priorityName={item.priority.name}
                  priorityColor={item.priority.icon.color}
                  priorityPaused={item.priority.status === 'paused'}
                  redirectBack={redirectBack}
                />
              </li>
            );
          }
          if (item.kind === 'event') {
            const e = item.event;
            return (
              <li key={e.id}>
                <DailyTimelineRow
                  kind="event"
                  id={e.id}
                  ownerPriorityId={e.ownerPriorityId}
                  title={e.title}
                  description={e.description}
                  timeRange={timeRangeOnly(e.startTime, e.endTime, userTimezone)}
                  recurrenceLabel={recurrenceLabel(e.recurrence)}
                  isVirtual={e.kind === 'virtual'}
                  completionStatus={
                    (e.completionStatus as 'attended' | 'missed' | null) ?? null
                  }
                  priorityName={item.priority.name}
                  priorityColor={item.priority.icon.color}
                  priorityPaused={item.priority.status === 'paused'}
                  redirectBack={redirectBack}
                />
              </li>
            );
          }
          const fe = item.feedEvent;
          return (
            <li key={fe.id}>
              <DailyTimelineRow
                kind="feedEvent"
                id={fe.id}
                title={fe.title}
                description={fe.description}
                timeRange={
                  fe.allDay ? null : timeRangeOnly(fe.startTime, fe.endTime, userTimezone)
                }
                allDay={fe.allDay}
                sourceName={item.sourceName}
                isRemoved={fe.removedFromSourceAt !== null}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
