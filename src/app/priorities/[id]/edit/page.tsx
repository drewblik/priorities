import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getPriorityById } from '@/lib/priorities';
import { DeleteForm } from '../../DeleteForm';
import { PriorityForm } from '../../PriorityForm';

type SearchParams = { [key: string]: string | string[] | undefined };

const ERROR_COPY: Record<string, string> = {
  validation_failed: "Some fields weren't valid. Check the values and try again.",
  save_failed: "We couldn't save your changes. Try again in a moment.",
  not_found: 'That Priority could not be found.',
};

export default async function EditPriorityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const { id } = await params;
  const priority = await getPriorityById(session.user.id, id);
  if (!priority) notFound();

  const sp = await searchParams;
  const errorCode = typeof sp.error === 'string' ? sp.error : null;
  const errorMessage = errorCode ? (ERROR_COPY[errorCode] ?? 'Something went wrong.') : null;
  const saved = sp.saved === '1';

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Priority</h1>
        <Link href="/priorities" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Council
        </Link>
      </header>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}
      {saved ? (
        <div className="mb-4 rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm text-green-700">
          Saved.
        </div>
      ) : null}

      <PriorityForm mode="edit" initial={priority} submitTarget={`/api/priorities/${id}`} />

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-sm font-medium">Danger zone</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Soft-deletes the Priority. Recoverable from the database until v1 ships an in-app trash UI.
        </p>
        <div className="mt-3">
          <DeleteForm action={`/api/priorities/${id}`} />
        </div>
      </section>
    </main>
  );
}
