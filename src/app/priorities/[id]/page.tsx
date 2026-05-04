import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/auth';
import { getPriorityById } from '@/lib/priorities';
import { DeleteForm } from '../DeleteForm';
import { FilesSection } from '../FilesSection';
import { MemorySection } from '../MemorySection';
import { PriorityForm } from '../PriorityForm';

type SearchParams = { [key: string]: string | string[] | undefined };

const TOAST_COPY: Record<string, { tone: 'success' | 'error'; message: string }> = {
  saved: { tone: 'success', message: 'Saved.' },
  memory_added: { tone: 'success', message: 'Memory entry added.' },
  memory_saved: { tone: 'success', message: 'Memory entry updated.' },
  memory_deleted: { tone: 'success', message: 'Memory entry deleted.' },
  file_uploaded: { tone: 'success', message: 'File uploaded.' },
  file_deleted: { tone: 'success', message: 'File deleted.' },
  validation_failed: { tone: 'error', message: "Some fields weren't valid. Check the values and try again." },
  memory_validation: { tone: 'error', message: "Memory entry didn't validate. Check the body and tags." },
  save_failed: { tone: 'error', message: "We couldn't save your changes. Try again in a moment." },
  not_found: { tone: 'error', message: 'That item could not be found.' },
  blob_not_configured: {
    tone: 'error',
    message: 'File uploads not configured. Set BLOB_READ_WRITE_TOKEN in Vercel.',
  },
  file_missing: { tone: 'error', message: 'No file was attached.' },
  file_too_large: { tone: 'error', message: 'File is too large (10MB limit).' },
  mime_not_allowed: { tone: 'error', message: 'That file type is not allowed.' },
  upload_failed: { tone: 'error', message: 'Upload failed. Try again.' },
};

export default async function PriorityDetailPage({
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
  const toast = (() => {
    for (const key of Object.keys(TOAST_COPY)) {
      if (sp[key] === '1') return TOAST_COPY[key];
    }
    if (typeof sp.error === 'string') {
      return TOAST_COPY[sp.error] ?? { tone: 'error' as const, message: 'Something went wrong.' };
    }
    return null;
  })();

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{priority.name}</h1>
        <Link href="/priorities" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Council
        </Link>
      </header>

      {toast ? (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            toast.tone === 'success'
              ? 'border-green-600/30 bg-green-600/5 text-green-700'
              : 'border-red-600/30 bg-red-600/5 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="space-y-6">
        <details open className="rounded-md border border-border bg-background p-4">
          <summary className="cursor-pointer select-none text-base font-medium">
            Edit fields
          </summary>
          <div className="mt-4">
            <PriorityForm mode="edit" initial={priority} submitTarget={`/api/priorities/${id}`} />
          </div>
        </details>

        <MemorySection userId={session.user.id} priorityId={id} />

        <FilesSection userId={session.user.id} priorityId={id} />

        <details className="rounded-md border border-border bg-background p-4">
          <summary className="cursor-pointer select-none text-base font-medium text-red-700">
            Danger zone
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Soft-deletes this Priority and cascades to its memory + files. Recoverable from the
              database until v1 ships an in-app trash UI.
            </p>
            <DeleteForm action={`/api/priorities/${id}`} />
          </div>
        </details>
      </div>
    </main>
  );
}
