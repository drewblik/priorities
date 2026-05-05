import Link from 'next/link';
import { getTasksForPriority } from '@/lib/tasks';
import {
  overrideLabelFor,
  recurrenceLabel,
  taskScheduleLine,
} from '@/lib/task-event-format';
import { TaskRow, type TaskRowDisplay } from './TaskRow';

type Props = {
  userId: string;
  priorityId: string;
  userTimezone: string;
};

export async function TasksSection({ userId, priorityId, userTimezone }: Props) {
  const rows = await getTasksForPriority(userId, priorityId);

  const display: TaskRowDisplay[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: (t.status as 'open' | 'done' | 'skipped'),
    scheduleLine: taskScheduleLine(t, userTimezone),
    recurrenceLabel: recurrenceLabel(t.recurrence),
    overrideLabel: overrideLabelFor(t),
    isTemplate: t.recurrence !== null && t.instanceOfTaskId === null,
  }));

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Tasks ({rows.length})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        To-dos owned by this Priority. Recurring templates show with a Template badge; overrides
        show with an Override badge.
      </p>

      <div className="mt-3">
        <Link
          href={`/priorities/${priorityId}/tasks/new`}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Create task
        </Link>
      </div>

      {display.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {display.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} priorityId={priorityId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">No tasks yet.</p>
      )}
    </details>
  );
}
