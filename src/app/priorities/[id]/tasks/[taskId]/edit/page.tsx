import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getPriorityById } from '@/lib/priorities';
import { getTaskById } from '@/lib/tasks';
import { toDatetimeLocal } from '@/lib/task-event-format';
import { TaskForm } from '../../../../TaskForm';

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const session = await requireUser();
  const { id, taskId } = await params;

  const [priority, task] = await Promise.all([
    getPriorityById(session.user.id, id),
    getTaskById(session.user.id, taskId),
  ]);
  if (!priority || !task || task.ownerPriorityId !== id) notFound();

  let templateTitle: string | null = null;
  let templateDate: string | null = null;
  if (task.instanceOfTaskId) {
    const template = await getTaskById(session.user.id, task.instanceOfTaskId);
    templateTitle = template?.title ?? null;
    templateDate = task.targetDate ?? null;
  }

  const back = `/priorities/${id}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Edit task</h1>
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; {priority.name}
        </Link>
      </header>
      <TaskForm
        mode="edit"
        ownerPriorityId={id}
        redirectBack={back}
        submitTarget={`/api/tasks/${taskId}`}
        initial={{
          id: task.id,
          title: task.title,
          description: task.description ?? '',
          targetDate: task.targetDate ?? '',
          timeBlockStart: toDatetimeLocal(task.timeBlockStart, session.user.timezone),
          timeBlockEnd: toDatetimeLocal(task.timeBlockEnd, session.user.timezone),
          recurrence: task.recurrence,
          status: (task.status as 'open' | 'done' | 'skipped') ?? 'open',
          isOverride: task.instanceOfTaskId !== null,
          templateTitle,
          templateDate,
        }}
      />
    </main>
  );
}
