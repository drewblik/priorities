'use client';

import Link from 'next/link';
import type { Recurrence } from '@/db/schema';
import { RecurrenceFields } from './RecurrenceFields';

type EventFormInitial = {
  id: string;
  title: string;
  description: string;
  startTime: string; // 'YYYY-MM-DDTHH:mm'
  endTime: string;
  recurrence: Recurrence | null;
  completionStatus: 'attended' | 'missed' | null;
  isOverride: boolean;
  templateTitle: string | null;
  templateDate: string | null;
};

type Props = {
  mode: 'create' | 'edit';
  ownerPriorityId: string;
  redirectBack: string;
  submitTarget: string;
  initial?: EventFormInitial;
};

export function EventForm({ mode, ownerPriorityId, redirectBack, submitTarget, initial }: Props) {
  const isOverride = initial?.isOverride === true;
  return (
    <form method="post" action={submitTarget} className="space-y-4">
      <input type="hidden" name="ownerPriorityId" value={ownerPriorityId} />
      <input type="hidden" name="_redirect" value={redirectBack} />

      {isOverride && initial ? (
        <p className="rounded-md border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-700">
          Override of &quot;{initial.templateTitle ?? '(template)'}&quot; on {initial.templateDate ?? '(date)'}.
          Editing this row only affects this date.
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Title</span>
        <input
          type="text"
          name="title"
          required
          defaultValue={initial?.title}
          maxLength={200}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Description (optional)</span>
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={initial?.description}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </label>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Start time</span>
          <input
            type="datetime-local"
            name="startTime"
            required
            defaultValue={initial?.startTime}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">End time</span>
          <input
            type="datetime-local"
            name="endTime"
            required
            defaultValue={initial?.endTime}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </label>
      </fieldset>

      {mode === 'edit' ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Completion</span>
          <select
            name="completionStatus"
            defaultValue={initial?.completionStatus ?? 'none'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          >
            <option value="none">Not yet</option>
            <option value="attended">Attended</option>
            <option value="missed">Missed</option>
          </select>
        </label>
      ) : null}

      {!isOverride ? <RecurrenceFields initial={initial?.recurrence ?? null} /> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {mode === 'create' ? 'Create event' : 'Save changes'}
        </button>
        <Link
          href={redirectBack}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
