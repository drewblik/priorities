import Link from 'next/link';
import { getEventsForPriority } from '@/lib/events';
import {
  eventOverrideLabelFor,
  eventScheduleLine,
  recurrenceLabel,
} from '@/lib/task-event-format';
import { EventRow, type EventRowDisplay } from './EventRow';

type Props = {
  userId: string;
  priorityId: string;
  userTimezone: string;
};

export async function EventsSection({ userId, priorityId, userTimezone }: Props) {
  const rows = await getEventsForPriority(userId, priorityId);

  const display: EventRowDisplay[] = rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    scheduleLine: eventScheduleLine(e, userTimezone),
    recurrenceLabel: recurrenceLabel(e.recurrence),
    overrideLabel: eventOverrideLabelFor(e, userTimezone),
    completionStatus: (e.completionStatus as 'attended' | 'missed' | null) ?? null,
    isTemplate: e.recurrence !== null && e.instanceOfEventId === null,
  }));

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Events ({rows.length})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Time-bound occurrences for this Priority. Mark each one Attended or Missed after it
        happens.
      </p>

      <div className="mt-3">
        <Link
          href={`/priorities/${priorityId}/events/new`}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Create event
        </Link>
      </div>

      {display.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {display.map((e) => (
            <li key={e.id}>
              <EventRow event={e} priorityId={priorityId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">No events yet.</p>
      )}
    </details>
  );
}
