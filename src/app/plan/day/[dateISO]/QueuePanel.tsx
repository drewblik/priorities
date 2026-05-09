import type { Priority } from '@/db/schema';

type Props = {
  priorities: Priority[];
  currentPriorityId: string | null;
  donePriorityIds: Set<string>;
};

export function QueuePanel({ priorities, currentPriorityId, donePriorityIds }: Props) {
  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Queue ({priorities.length})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Active Priorities with a daily cadence. The chatbot walks through
        each one in order, time-blocking tomorrow&apos;s tasks.
      </p>

      {priorities.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No Priorities have a daily cadence yet. Open a Priority and add
          &ldquo;daily&rdquo; to its check-in cadence.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {priorities.map((p) => {
            const isCurrent = p.id === currentPriorityId;
            const isDone = donePriorityIds.has(p.id);
            const state: 'current' | 'done' | 'queued' = isCurrent
              ? 'current'
              : isDone
                ? 'done'
                : 'queued';
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded-md border bg-background px-3 py-2 ${
                  state === 'current'
                    ? 'border-l-4 border-l-primary'
                    : state === 'done'
                      ? 'opacity-60'
                      : 'border-border'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 flex-none rounded-full"
                    style={{ backgroundColor: p.icon.color }}
                  />
                  <span
                    className={`truncate text-sm ${
                      state === 'done' ? 'text-muted-foreground line-through' : 'font-medium'
                    }`}
                  >
                    {p.name}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    state === 'current'
                      ? 'border-primary bg-primary/10 text-primary'
                      : state === 'done'
                        ? 'border-green-600/30 bg-green-600/5 text-green-700'
                        : 'border-border bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {state === 'current' ? 'Current' : state === 'done' ? 'Done ✓' : 'Queued'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
