import { formatInTimeZone } from 'date-fns-tz';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getEventById } from '@/lib/events';
import { getPriorityById } from '@/lib/priorities';
import { toDatetimeLocal } from '@/lib/task-event-format';
import { EventForm } from '../../../../EventForm';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const session = await requireUser();
  const { id, eventId } = await params;

  const [priority, event] = await Promise.all([
    getPriorityById(session.user.id, id),
    getEventById(session.user.id, eventId),
  ]);
  if (!priority || !event || event.ownerPriorityId !== id) notFound();

  let templateTitle: string | null = null;
  let templateDate: string | null = null;
  if (event.instanceOfEventId) {
    const template = await getEventById(session.user.id, event.instanceOfEventId);
    templateTitle = template?.title ?? null;
    templateDate = formatInTimeZone(event.startTime, session.user.timezone, 'yyyy-MM-dd');
  }

  const back = `/priorities/${id}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Edit event</h1>
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; {priority.name}
        </Link>
      </header>
      <EventForm
        mode="edit"
        ownerPriorityId={id}
        redirectBack={back}
        submitTarget={`/api/events/${eventId}`}
        initial={{
          id: event.id,
          title: event.title,
          description: event.description ?? '',
          startTime: toDatetimeLocal(event.startTime, session.user.timezone),
          endTime: toDatetimeLocal(event.endTime, session.user.timezone),
          recurrence: event.recurrence,
          completionStatus: (event.completionStatus as 'attended' | 'missed' | null) ?? null,
          isOverride: event.instanceOfEventId !== null,
          templateTitle,
          templateDate,
        }}
      />
    </main>
  );
}
