'use client';

import { useState } from 'react';

type Props = {
  itemRef: string; // e.g. "task:tsk_abc123"
  title: string;
  subtitle: string | null;
  /** Default new-date value when the user picks "Moved". For tasks, this is
   *  tomorrow ISO; for events the option isn't shown. */
  defaultMoveDate: string;
  /** Whether this row supports the "Moved" action. Tasks: yes. Events: no
   *  (an event is intrinsically time-bound; "moving" creates a new event). */
  allowMove: boolean;
};

export function ProgressItemRow({ itemRef, title, subtitle, defaultMoveDate, allowMove }: Props) {
  const [action, setAction] = useState<'none' | 'done' | 'skipped' | 'moved'>('none');

  return (
    <li className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{title}</div>
          {subtitle ? (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
        <RadioPill
          name={`action-${itemRef}`}
          value="done"
          label="Done"
          tone="green"
          checked={action === 'done'}
          onChange={() => setAction('done')}
        />
        <RadioPill
          name={`action-${itemRef}`}
          value="skipped"
          label="Skipped"
          tone="gray"
          checked={action === 'skipped'}
          onChange={() => setAction('skipped')}
        />
        {allowMove ? (
          <RadioPill
            name={`action-${itemRef}`}
            value="moved"
            label="Moved"
            tone="amber"
            checked={action === 'moved'}
            onChange={() => setAction('moved')}
          />
        ) : null}
      </div>

      {action === 'moved' && allowMove ? (
        <label className="mt-2 block space-y-1">
          <span className="text-xs text-muted-foreground">New date</span>
          <input
            type="date"
            name={`move-${itemRef}`}
            defaultValue={defaultMoveDate}
            required
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          />
        </label>
      ) : null}
    </li>
  );
}

type RadioPillProps = {
  name: string;
  value: string;
  label: string;
  tone: 'green' | 'gray' | 'amber';
  checked: boolean;
  onChange: () => void;
};

function RadioPill({ name, value, label, tone, checked, onChange }: RadioPillProps) {
  const baseClasses =
    'cursor-pointer rounded-full border px-3 py-1 transition-colors';
  const toneClasses = checked
    ? tone === 'green'
      ? 'border-green-600/50 bg-green-600/10 text-green-700 font-medium'
      : tone === 'amber'
        ? 'border-amber-600/50 bg-amber-600/10 text-amber-700 font-medium'
        : 'border-border bg-muted text-foreground font-medium'
    : 'border-border text-muted-foreground hover:bg-muted';
  return (
    <label className={`${baseClasses} ${toneClasses}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  );
}
