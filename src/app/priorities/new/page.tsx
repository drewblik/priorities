import Link from 'next/link';
import { requireUser } from '@/auth';
import { PriorityForm } from '../PriorityForm';

type SearchParams = { [key: string]: string | string[] | undefined };

const ERROR_COPY: Record<string, string> = {
  validation_failed: "Some fields weren't valid. Check the values and try again.",
  save_failed: "We couldn't save the Priority. Try again in a moment.",
};

export default async function NewPriorityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const params = await searchParams;
  const errorCode = typeof params.error === 'string' ? params.error : null;
  const errorMessage = errorCode ? (ERROR_COPY[errorCode] ?? 'Something went wrong.') : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New Priority</h1>
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

      <PriorityForm mode="create" submitTarget="/api/priorities" />
    </main>
  );
}
