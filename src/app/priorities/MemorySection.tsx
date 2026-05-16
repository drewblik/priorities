import Link from 'next/link';
import { getArchivedMemoryForPriority } from '@/lib/memory-summarize';
import { getMemoryForPriority } from '@/lib/priority-memory';
import { MemoryEntry } from './MemoryEntry';

type Props = {
  userId: string;
  priorityId: string;
  /** When set via ?archived_memory=1 on Priority Detail, also render the
   *  soft-deleted (summarized-away) entries read-only. */
  showArchived?: boolean;
};

export async function MemorySection({ userId, priorityId, showArchived = false }: Props) {
  const entries = await getMemoryForPriority(userId, priorityId);
  const archived = showArchived
    ? await getArchivedMemoryForPriority(userId, priorityId)
    : [];

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Memory ({entries.length})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Markdown notes about this Priority. Council chatbots will read recent entries when planning.
      </p>

      <form
        method="post"
        action={`/api/priorities/${priorityId}/memory`}
        className="mt-4 space-y-2"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Add memory</span>
          <textarea
            name="body"
            required
            rows={3}
            maxLength={10_000}
            placeholder="What's worth remembering about this Priority?"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </label>
        <input
          type="text"
          name="tags"
          placeholder="Tags (comma-separated, optional)"
          maxLength={500}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Add entry
        </button>
      </form>

      {entries.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <MemoryEntry entry={entry} priorityId={priorityId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No memory entries yet.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <form
          method="post"
          action={`/api/priorities/${priorityId}/memory/summarize`}
        >
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            title="Fold older entries into the pinned summary (keeps the 10 most recent)"
          >
            Compress memory
          </button>
        </form>
        <Link
          href={`/priorities/${priorityId}?archived_memory=${showArchived ? '0' : '1'}#memory`}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {showArchived ? 'Hide archived memory' : 'View archived memory'}
        </Link>
      </div>

      {showArchived ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Archived ({archived.length}) — summarized into the pinned
            summary, read-only
          </p>
          {archived.length > 0 ? (
            <ul className="space-y-2">
              {archived.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                >
                  <div className="text-[10px] uppercase tracking-wide">
                    {entry.createdAt.toISOString().slice(0, 10)} · {entry.source}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{entry.body}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing archived yet.
            </p>
          )}
        </div>
      ) : null}
    </details>
  );
}
