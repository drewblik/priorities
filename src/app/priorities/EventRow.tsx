'use client';

import Link from 'next/link';

export type EventRowDisplay = {
  id: string;
  title: string;
  description: string | null;
  scheduleLine: string;
  recurrenceLabel: string | null;
  overrideLabel: string | null;
  completionStatus: 'attended' | 'missed' | null;
  isTemplate: boolean;
};

type Props = {
  event: EventRowDisplay;
  priorityId: string;
};

const STATUS_OPTIONS: { value: 'none' | 'attended' | 'missed'; label: string }[] = [
  { value: 'none', label: 'Not yet' },
  { value: 'attended', label: 'Attended' },
  { value: 'missed', label: 'Missed' },
];

export function EventRow({ event, priorityId }: Props) {
  const back = `/priorities/${priorityId}`;
  const editHref = `/priorities/${priorityId}/events/${event.id}/edit`;
  const eventAction = `/api/events/${event.id}`;
  const current = event.completionStatus ?? 'none';

  return (
    <article className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="truncate text-sm font-medium">{event.title}</h4>
        {event.isTemplate ? (
          <span className="rounded-full border border-blue-600/30 bg-blue-600/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-700">
            Template
          </span>
        ) : null}
        {event.overrideLabel ? (
          <span className="rounded-full border border-amber-600/30 bg-amber-600/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
            {event.overrideLabel}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{event.scheduleLine}</p>

      {event.recurrenceLabel ? (
        <p className="text-xs text-muted-foreground">↻ {event.recurrenceLabel}</p>
      ) : null}

      {event.description ? (
        <p className="whitespace-pre-wrap text-xs text-foreground/80">{event.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 pt-1">
        {STATUS_OPTIONS.map((opt) => (
          <form key={opt.value} method="post" action={eventAction}>
            <input type="hidden" name="_redirect" value={back} />
            <input
              type="hidden"
              name="completionStatus"
              value={opt.value === 'none' ? '' : opt.value}
            />
            <button
              type="submit"
              className={`rounded-md border px-2 py-1 text-xs ${
                current === opt.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-muted'
              }`}
              aria-pressed={current === opt.value}
            >
              {opt.label}
            </button>
          </form>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Link href={editHref} className="text-xs text-muted-foreground hover:text-foreground">
          Edit
        </Link>
        <span className="text-xs text-muted-foreground">·</span>
        <form
          method="post"
          action={eventAction}
          onSubmit={(e) => {
            if (!window.confirm('Delete this event?')) e.preventDefault();
          }}
        >
          <input type="hidden" name="_action" value="delete" />
          <input type="hidden" name="_redirect" value={back} />
          <button type="submit" className="text-xs text-red-700 hover:underline">
            Delete
          </button>
        </form>
      </div>
    </article>
  );
}
