'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  sessionId: string | null;
};

export function EndSessionPlaceholder({ sessionId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function endSession() {
    if (sessionId) {
      setBusy(true);
      try {
        await fetch('/api/plan/week/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } finally {
        setBusy(false);
      }
    }
    router.push('/priorities');
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={endSession}
          disabled={busy}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          End session
        </button>
        <Link
          href="/priorities"
          className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Council
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Closes the active priority&apos;s session. The queue resumes at the
        next un-completed Priority next time you open Weekly Plan.
      </p>
    </div>
  );
}
