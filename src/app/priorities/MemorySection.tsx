import { getMemoryForPriority } from '@/lib/priority-memory';
import { MemoryEntry } from './MemoryEntry';

type Props = {
  userId: string;
  priorityId: string;
};

export async function MemorySection({ userId, priorityId }: Props) {
  const entries = await getMemoryForPriority(userId, priorityId);

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
    </details>
  );
}
