'use client';

import { useState } from 'react';
import type { Recurrence } from '@/db/schema';

const WEEKDAY_LABELS: { code: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'; label: string }[] = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
];

type Props = {
  initial: Recurrence | null;
};

export function RecurrenceFields({ initial }: Props) {
  const [type, setType] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(
    initial?.type ?? 'none',
  );
  const [interval, setInterval] = useState<number>(initial?.interval ?? 1);

  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recurrence
      </legend>

      {/* Hidden marker so the form parser knows recurrence was edited (vs. omitted). */}
      <input type="hidden" name="recurrence_present" value="1" />

      <label className="block space-y-1">
        <span className="text-sm font-medium">Repeats</span>
        <select
          name="recurrence_type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
        >
          <option value="none">Never</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>

      {type !== 'none' ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Every</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="recurrence_interval"
              min={1}
              max={type === 'daily' ? 365 : type === 'weekly' ? 52 : 12}
              value={interval}
              onChange={(e) => setInterval(Number.parseInt(e.target.value, 10) || 1)}
              className="w-24 rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
            <span className="text-sm text-muted-foreground">
              {type === 'daily' ? 'day(s)' : type === 'weekly' ? 'week(s)' : 'month(s)'}
            </span>
          </div>
        </label>
      ) : null}

      {type === 'weekly' ? (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">On these days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((wd) => (
              <label
                key={wd.code}
                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  name="recurrence_byday"
                  value={wd.code}
                  defaultChecked={
                    initial?.type === 'weekly' && (initial.byday ?? []).includes(wd.code)
                  }
                />
                {wd.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {type === 'monthly' ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Day of month</span>
          <input
            type="number"
            name="recurrence_bymonthday"
            min={1}
            max={31}
            defaultValue={
              initial?.type === 'monthly' ? initial.bymonthday : undefined
            }
            placeholder="1–31"
            className="w-24 rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </label>
      ) : null}

      {type !== 'none' ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Until (optional)</span>
          <input
            type="date"
            name="recurrence_until"
            defaultValue={initial?.until ?? ''}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </label>
      ) : null}
    </fieldset>
  );
}
