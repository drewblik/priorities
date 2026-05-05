'use client';

import Link from 'next/link';
import type { Recurrence } from '@/db/schema';
import { RecurrenceFields } from './RecurrenceFields';

type TaskFormInitial = {
  id: string;
  title: string;
  description: string;
  targetDate: string; // 'YYYY-MM-DD' or ''
  timeBlockStart: string; // 'YYYY-MM-DDTHH:mm' or ''
  timeBlockEnd: string;
  recurrence: Recurrence | null;
  status: 'open' | 'done' | 'skipped';
  isOverride: boolean;
  templateTitle: string | null;
  templateDate: string | null;
};

type Props = {
  mode: 'create' | 'edit';
  ownerPriorityId: string;
  redirectBack: string;
  submitTarget: string;
  initial?: TaskFormInitial;
};

export function TaskForm({ mode, ownerPriorityId, redirectBack, submitTarget, initial }: Props) {
  const isOverride = initial?.isOverride === true;

  return (
    <form method="post" action={submitTarget} className="space-y-4">
      <input type="hidden" name="ownerPriorityId" value={ownerPriorityId} />
      <input type="hidden" name="_redirect" value={redirectBack} />

      {isOverride && initial ? (
        <p className="rounded-md border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-700">
          Override of &quot;{initial.templateTitle ?? '(template)'}&quot; on {initial.templateDate ?? '(date)'}.
          Editing this row only affects this date; the recurring template is unchanged.
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Title <span className="text-red-700">*</span>
        </span>
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

      <label className="block space-y-1">
        <span className="text-sm font-medium">Target date (optional)</span>
        <input
          type="date"
          name="targetDate"
          defaultValue={initial?.targetDate}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </label>

      <fieldset className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Time block (optional). Leave both blank, or set both — the end time must come
          after the start time.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Start</span>
            <input
              type="datetime-local"
              name="timeBlockStart"
              defaultValue={initial?.timeBlockStart}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">End</span>
            <input
              type="datetime-local"
              name="timeBlockEnd"
              defaultValue={initial?.timeBlockEnd}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
          </label>
        </div>
      </fieldset>

      {mode === 'edit' && !isOverride ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Status</span>
          <select
            name="status"
            defaultValue={initial?.status ?? 'open'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="skipped">Skipped</option>
          </select>
        </label>
      ) : null}

      {!isOverride ? <RecurrenceFields initial={initial?.recurrence ?? null} /> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {mode === 'create' ? 'Create task' : 'Save changes'}
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
