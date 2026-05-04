'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Priority } from '@/db/schema';
import { PriorityCard } from './PriorityCard';

type Props = {
  priority: Priority;
};

export function SortablePriorityCard({ priority }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: priority.id,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    touchAction: 'none',
  };

  const isActive = priority.status === 'active';
  const isPaused = priority.status === 'paused';
  const isArchived = priority.status === 'archived';

  return (
    <li ref={setNodeRef} style={style} className="relative">
      <div className="flex items-stretch gap-2">
        <div className="flex-1" {...attributes} {...listeners}>
          <PriorityCard priority={priority} />
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Actions"
          aria-expanded={menuOpen}
          className="flex h-auto items-center justify-center rounded-md border border-border bg-background px-3 text-muted-foreground hover:bg-muted"
        >
          ⋯
        </button>
      </div>

      {menuOpen ? (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-background shadow-md"
          onClick={() => setMenuOpen(false)}
        >
          <Link
            href={`/priorities/${priority.id}/edit`}
            className="block px-3 py-2 text-sm hover:bg-muted"
          >
            Edit
          </Link>

          {isActive ? (
            <StatusActionForm id={priority.id} newStatus="paused" label="Pause" />
          ) : null}
          {isPaused ? (
            <StatusActionForm id={priority.id} newStatus="active" label="Resume" />
          ) : null}

          {!isArchived ? (
            <StatusActionForm id={priority.id} newStatus="archived" label="Archive" />
          ) : (
            <StatusActionForm id={priority.id} newStatus="active" label="Reactivate" />
          )}

          <DeleteActionForm id={priority.id} />
        </div>
      ) : null}
    </li>
  );
}

function StatusActionForm({
  id,
  newStatus,
  label,
}: {
  id: string;
  newStatus: 'active' | 'paused' | 'archived';
  label: string;
}) {
  return (
    <form method="post" action={`/api/priorities/${id}`}>
      <input type="hidden" name="status" value={newStatus} />
      <button
        type="submit"
        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
      >
        {label}
      </button>
    </form>
  );
}

function DeleteActionForm({ id }: { id: string }) {
  return (
    <form
      method="post"
      action={`/api/priorities/${id}`}
      onSubmit={(e) => {
        if (!window.confirm('Delete this Priority? Recoverable via SQL until M19.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="_action" value="delete" />
      <button
        type="submit"
        className="block w-full border-t border-border px-3 py-2 text-left text-sm text-red-700 hover:bg-red-600/5"
      >
        Delete
      </button>
    </form>
  );
}
