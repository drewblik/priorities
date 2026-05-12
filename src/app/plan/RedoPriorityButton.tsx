'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  sessionType: 'quarter' | 'weekly' | 'daily';
  contextRef: string;
  priorityId: string;
};

export function RedoPriorityButton({ sessionType, contextRef, priorityId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/plan/replan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'one',
          sessionType,
          contextRef,
          priorityId,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? `Redo failed (${res.status}).`);
        return;
      }
      // Drop ?mode=adjust so the page re-bootstraps in the normal mode with
      // the reopened priority as the current one.
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      router.replace(`${url.pathname}${url.search}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={redo}
        disabled={busy}
        className="rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
      >
        {busy ? '…' : 'Redo'}
      </button>
      {error ? <span className="text-[10px] text-red-700">{error}</span> : null}
    </div>
  );
}
