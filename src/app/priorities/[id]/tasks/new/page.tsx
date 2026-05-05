import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getPriorityById } from '@/lib/priorities';
import { TaskForm } from '../../../TaskForm';

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const { id } = await params;
  const priority = await getPriorityById(session.user.id, id);
  if (!priority) notFound();

  const back = `/priorities/${id}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New task</h1>
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; {priority.name}
        </Link>
      </header>
      <TaskForm
        mode="create"
        ownerPriorityId={id}
        redirectBack={back}
        submitTarget="/api/tasks"
      />
    </main>
  );
}
