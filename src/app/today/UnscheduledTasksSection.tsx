import { recurrenceLabel } from '@/lib/task-event-format';
import type { Priority } from '@/db/schema';
import type { DisplayedTask } from '@/lib/recurrence';
import { DailyTimelineRow } from './DailyTimelineRow';

type Props = {
  items: { task: DisplayedTask; priority: Priority }[];
  redirectBack: string;
};

export function UnscheduledTasksSection({ items, redirectBack }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Unscheduled
      </h2>
      <ul className="space-y-2">
        {items.map(({ task, priority }) => (
          <li key={task.id}>
            <DailyTimelineRow
              kind="task"
              id={task.id}
              ownerPriorityId={task.ownerPriorityId}
              title={task.title}
              description={task.description}
              status={(task.status as 'open' | 'done' | 'skipped') ?? 'open'}
              timeRange={null}
              recurrenceLabel={recurrenceLabel(task.recurrence)}
              isVirtual={task.kind === 'virtual'}
              priorityName={priority.name}
              priorityColor={priority.icon.color}
              priorityPaused={priority.status === 'paused'}
              redirectBack={redirectBack}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
