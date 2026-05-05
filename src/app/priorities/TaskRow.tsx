'use client';

import Link from 'next/link';

export type TaskRowDisplay = {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'done' | 'skipped';
  scheduleLine: string;
  recurrenceLabel: string | null;
  overrideLabel: string | null;
  isTemplate: boolean;
};

type Props = {
  task: TaskRowDisplay;
  priorityId: string;
};

export function TaskRow({ task, priorityId }: Props) {
  const back = `/priorities/${priorityId}`;
  const editHref = `/priorities/${priorityId}/tasks/${task.id}/edit`;
  const completeAction = `/api/tasks/${task.id}/complete`;
  const taskAction = `/api/tasks/${task.id}`;
  const checkboxLabel = task.status === 'done' ? 'Mark open' : 'Mark done';

  return (
    <article className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
      <form method="post" action={completeAction} className="pt-0.5">
        <input type="hidden" name="_redirect" value={back} />
        <button
          type="submit"
          aria-label={checkboxLabel}
          title={checkboxLabel}
          className={`flex h-5 w-5 items-center justify-center rounded border ${
            task.status === 'done'
              ? 'border-green-600 bg-green-600 text-white'
              : 'border-border hover:border-primary'
          }`}
        >
          {task.status === 'done' ? '✓' : task.status === 'skipped' ? '–' : ''}
        </button>
      </form>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4
            className={`truncate text-sm font-medium ${
              task.status === 'done' ? 'text-muted-foreground line-through' : ''
            }`}
          >
            {task.title}
          </h4>
          {task.isTemplate ? (
            <span className="rounded-full border border-blue-600/30 bg-blue-600/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-700">
              Template
            </span>
          ) : null}
          {task.overrideLabel ? (
            <span className="rounded-full border border-amber-600/30 bg-amber-600/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
              {task.overrideLabel}
            </span>
          ) : null}
          {task.status === 'skipped' ? (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              skipped
            </span>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">{task.scheduleLine}</p>

        {task.recurrenceLabel ? (
          <p className="text-xs text-muted-foreground">↻ {task.recurrenceLabel}</p>
        ) : null}

        {task.description ? (
          <p className="whitespace-pre-wrap text-xs text-foreground/80">{task.description}</p>
        ) : null}

        <div className="flex items-center gap-3 pt-1">
          <Link href={editHref} className="text-xs text-muted-foreground hover:text-foreground">
            Edit
          </Link>
          <span className="text-xs text-muted-foreground">·</span>
          <form
            method="post"
            action={taskAction}
            onSubmit={(e) => {
              if (!window.confirm('Delete this task?')) e.preventDefault();
            }}
          >
            <input type="hidden" name="_action" value="delete" />
            <input type="hidden" name="_redirect" value={back} />
            <button type="submit" className="text-xs text-red-700 hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
