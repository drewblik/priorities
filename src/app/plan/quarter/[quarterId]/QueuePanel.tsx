import type { Priority } from '@/db/schema';

type Props = {
  priorities: Priority[];
};

export function QueuePanel({ priorities }: Props) {
  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Queue ({priorities.length})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Active Priorities with a quarterly cadence. The chatbot in M12 walks
        through each one in order.
      </p>

      {priorities.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No Priorities have a quarterly cadence yet. Open a Priority and add
          &quot;quarterly&quot; to its check-in cadence.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {priorities.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: p.icon.color }}
                />
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {p.minMinutesPerWeek === 0 && p.maxMinutesPerWeek === 0
                    ? '· No weekly target'
                    : `· ${p.minMinutesPerWeek}–${p.maxMinutesPerWeek} min/wk`}
                </span>
              </div>
              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Queued
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
