'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { PriorityMemory } from '@/db/schema';

type Props = {
  entry: PriorityMemory;
  priorityId: string;
};

export function MemoryEntry({ entry, priorityId }: Props) {
  const [editing, setEditing] = useState(false);
  const action = `/api/priorities/${priorityId}/memory/${entry.id}`;

  if (editing) {
    return (
      <article className="space-y-2 rounded-md border border-border bg-background p-3">
        <form method="post" action={action} className="space-y-2">
          <textarea
            name="body"
            required
            defaultValue={entry.body}
            rows={4}
            maxLength={10_000}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
          <input
            type="text"
            name="tags"
            defaultValue={entry.tags.join(', ')}
            placeholder="Tags (comma-separated, optional)"
            maxLength={500}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={entry.createdAt.toISOString()}>{formatDate(entry.createdAt)}</time>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide">
          {entry.source}
        </span>
        {entry.updatedAt.getTime() !== entry.createdAt.getTime() ? (
          <span className="text-[10px] italic">edited</span>
        ) : null}
      </div>

      <div className="prose prose-sm max-w-none break-words text-foreground">
        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{entry.body}</ReactMarkdown>
      </div>

      {entry.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Edit
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <form
          method="post"
          action={action}
          onSubmit={(e) => {
            if (!window.confirm('Delete this memory entry?')) e.preventDefault();
          }}
        >
          <input type="hidden" name="_action" value="delete" />
          <button type="submit" className="text-xs text-red-700 hover:underline">
            Delete
          </button>
        </form>
      </div>
    </article>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
