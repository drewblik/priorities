'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Priority } from '@/db/schema';
import { SortablePriorityCard } from './SortablePriorityCard';

type Props = {
  initial: Priority[];
  /** Scheduled minutes this week per priority id (M20 weekly tracking). */
  scheduledMinutes?: Record<string, number>;
};

export function PrioritiesList({ initial, scheduledMinutes = {} }: Props) {
  const [items, setItems] = useState<Priority[]>(initial);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setError(null);

    try {
      const res = await fetch('/api/priorities/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const body = (await res.json()) as { error?: string; detail?: string };
          detail = body.detail ?? body.error ?? '';
        } catch {
          // body wasn't JSON; ignore.
        }
        throw new Error(detail ? `${res.status}: ${detail}` : `reorder ${res.status}`);
      }
    } catch (err) {
      console.error(err);
      setItems(previous);
      const msg = err instanceof Error ? err.message : 'unknown error';
      setError(`Couldn't save the new order. (${msg}) Try again.`);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No Priorities yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap "Create Priority" below to add your first one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {items.map((priority) => (
              <SortablePriorityCard
                key={priority.id}
                priority={priority}
                scheduledMinutes={scheduledMinutes[priority.id] ?? 0}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <p className="text-xs text-muted-foreground">
        Long-press a card to drag and reorder.
      </p>
    </div>
  );
}
