'use client';

import { useState } from 'react';
import type { Priority } from '@/db/schema';
import {
  CADENCE_VALUES,
  ICON_STYLES,
  PRIORITY_STATUSES,
} from '@/lib/priorities-validation';
import { IconPicker } from './IconPicker';

type Props = {
  mode: 'create' | 'edit';
  initial?: Priority;
  submitTarget: string;
};

export function PriorityForm({ mode, initial, submitTarget }: Props) {
  const initialCadence = new Set(
    (initial?.checkInCadence ?? ['quarterly', 'weekly', 'daily']) as readonly string[],
  );
  const [cadence, setCadence] = useState<Set<string>>(initialCadence);

  const initialIcon = initial?.icon ?? { color: '#3b82f6', style: 'classic' };
  const initialStyle = (ICON_STYLES as readonly string[]).includes(initialIcon.style)
    ? (initialIcon.style as (typeof ICON_STYLES)[number])
    : 'classic';

  return (
    <form method="post" action={submitTarget} className="space-y-5">
      <Field label="Name" hint="What is this Priority called?">
        <input
          type="text"
          name="name"
          required
          defaultValue={initial?.name ?? ''}
          maxLength={120}
          placeholder="e.g. Health"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </Field>

      <Field label="Icon">
        <IconPicker initialColor={initialIcon.color} initialStyle={initialStyle} />
      </Field>

      <Field
        label="Weekly time target"
        hint="Minimum and maximum minutes per week. Tracking only — no enforcement in v1."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="minMinutesPerWeek"
            min={0}
            max={10000}
            required
            defaultValue={initial?.minMinutesPerWeek ?? 0}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="number"
            name="maxMinutesPerWeek"
            min={0}
            max={10000}
            required
            defaultValue={initial?.maxMinutesPerWeek ?? 0}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
          <span className="text-sm text-muted-foreground">min/wk</span>
        </div>
      </Field>

      <Field label="Check-in cadence" hint="Which planning rituals include this Priority.">
        <div className="flex flex-wrap gap-2">
          {CADENCE_VALUES.map((c) => {
            const checked = cadence.has(c);
            return (
              <label
                key={c}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm capitalize ${
                  checked ? 'border-foreground bg-muted' : 'border-border hover:bg-muted'
                }`}
              >
                <input
                  type="checkbox"
                  name="checkInCadence"
                  value={c}
                  checked={checked}
                  onChange={() =>
                    setCadence((prev) => {
                      const next = new Set(prev);
                      if (next.has(c)) next.delete(c);
                      else next.add(c);
                      return next;
                    })
                  }
                  className="h-4 w-4"
                />
                {c}
              </label>
            );
          })}
        </div>
      </Field>

      <Field
        label="SMART goal"
        hint="Specific, measurable, achievable, relevant, time-bound. Optional."
      >
        <textarea
          name="smartGoal"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.smartGoal ?? ''}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </Field>

      <Field label="Quarterly strategy" hint="High-level direction for the next 13 weeks.">
        <textarea
          name="quarterlyStrategy"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.quarterlyStrategy ?? ''}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </Field>

      <Field label="Weekly strategy" hint="What focusing on this Priority looks like in a typical week.">
        <textarea
          name="weeklyStrategy"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.weeklyStrategy ?? ''}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </Field>

      <Field label="Daily strategy" hint="What it looks like in a typical day.">
        <textarea
          name="dailyStrategy"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.dailyStrategy ?? ''}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        />
      </Field>

      {mode === 'edit' ? (
        <Field label="Status">
          <select
            name="status"
            defaultValue={initial?.status ?? 'active'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          >
            {PRIORITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {mode === 'create' ? 'Create Priority' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
