import { getFilesForPriority, isBlobConfigured } from '@/lib/priority-files';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '@/lib/priorities-validation';

type Props = {
  userId: string;
  priorityId: string;
};

export async function FilesSection({ userId, priorityId }: Props) {
  const files = await getFilesForPriority(userId, priorityId);
  const blobReady = isBlobConfigured();

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Files ({files.length})
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Up to 10MB per file. Images, PDFs, and plain-text formats only.
      </p>

      {blobReady ? (
        <form
          method="post"
          action={`/api/priorities/${priorityId}/files`}
          encType="multipart/form-data"
          className="mt-4 space-y-2"
        >
          <input
            type="file"
            name="file"
            required
            accept={ALLOWED_MIME_TYPES.join(',')}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:hover:bg-muted"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Upload
          </button>
        </form>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          File uploads not configured. Provision Vercel Blob and set{' '}
          <code className="rounded bg-background px-1">BLOB_READ_WRITE_TOKEN</code> in env vars to
          enable.
        </div>
      )}

      {files.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-3 rounded-md border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={f.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {f.filename}
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatBytes(f.sizeBytes)} · {f.mimeType} · {formatDate(f.uploadedAt)}
                </p>
              </div>
              <form method="post" action={`/api/priorities/${priorityId}/files/${f.id}`}>
                <input type="hidden" name="_action" value="delete" />
                <button
                  type="submit"
                  className="text-xs text-red-700 hover:underline"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
