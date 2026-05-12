'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SessionType = 'quarter' | 'weekly' | 'daily';

type Props = {
  sessionType: SessionType;
  contextRef: string;
  /** Optional: when in Adjust mode, the parent page renders the queue
   *  panel with per-priority Redo buttons and hides the picker's adjust
   *  action. The picker just toggles the page's mode. */
  adjustMode: boolean;
};

const HORIZON_LABEL: Record<SessionType, string> = {
  quarter: 'quarter',
  weekly: 'week',
  daily: 'day',
};

export function ReplanModePicker({ sessionType, contextRef, adjustMode }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horizon = HORIZON_LABEL[sessionType];

  async function startAdjust() {
    // Toggle to Adjust mode via a query param. The page re-reads its
    // search params and switches the QueuePanel into adjust mode.
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'adjust');
    router.replace(`${url.pathname}${url.search}`);
  }

  async function replanAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/plan/replan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'all', sessionType, contextRef }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? `Replan failed (${res.status}).`);
        return;
      }
      // Drop ?mode=adjust if it was set, then refresh to re-bootstrap the
      // page from the first priority.
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      router.replace(`${url.pathname}${url.search}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (adjustMode) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm text-foreground">
          <span className="font-medium">Adjust mode.</span> Tap{' '}
          <span className="font-medium">Redo</span> next to a Priority in the
          queue to reopen its conversation. Saved items stay; you&apos;re just
          continuing the chat.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('mode');
              router.replace(`${url.pathname}${url.search}`);
            }}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Exit Adjust mode
          </button>
        </div>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="rounded-md border border-red-600/30 bg-red-600/5 p-4">
        <p className="text-sm font-medium text-red-700">
          Replan the entire {horizon}?
        </p>
        <p className="mt-1 text-sm text-red-700/80">
          This reopens the conversation for every Priority. Items already
          saved (tasks, events, focus chips) stay — only the chat sessions
          restart.
        </p>
        {error ? (
          <p className="mt-2 rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={replanAll}
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Replanning…' : 'Yes, replan all'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-green-600/30 bg-green-600/5 p-4">
      <p className="text-sm font-medium text-green-700">
        {capitalize(horizon)} plan complete ✓
      </p>
      <p className="mt-1 text-sm text-green-700/80">
        Every Priority&apos;s conversation has wrapped up. Want to revise
        anything?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startAdjust}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Adjust one Priority
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-red-600/30 px-3 py-2 text-sm text-red-700 hover:bg-red-600/5"
        >
          Replan all
        </button>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
