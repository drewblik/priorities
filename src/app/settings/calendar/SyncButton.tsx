'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props =
  | { scope: 'all'; className?: string; label?: string }
  | { scope: 'feed'; feedId: string; className?: string; label?: string };

/**
 * Client-driven calendar sync with inline status. Uses a JSON POST so the
 * route returns JSON (never a 303/redirect) — the old `<form>` posts could
 * surface the raw response as a Safari "sync.txt" download when the slow
 * Outlook feed errored. AbortController caps the wait so the button always
 * resolves; on success it router.refresh()es the page.
 */
export function SyncButton(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'ok'; msg: string }
    | { kind: 'err'; msg: string }
  >({ kind: 'idle' });

  const label = props.label ?? (props.scope === 'all' ? '↻ Sync all' : 'Sync now');

  async function run() {
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    const ctrl = new AbortController();
    // Vercel Hobby kills the function at 60s; give the client a little
    // more so we read its JSON rather than hanging forever.
    const t = setTimeout(() => ctrl.abort(), 75_000);
    try {
      const res = await fetch(
        props.scope === 'all'
          ? '/api/calendar-feeds/sync-all'
          : '/api/calendar-feeds/sync',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(props.scope === 'feed' ? { id: props.feedId } : {}),
          signal: ctrl.signal,
        },
      );
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; synced?: number; failed?: number; error?: string }
        | null;
      if (!res.ok || !j) {
        setStatus({ kind: 'err', msg: j?.error ?? `Failed (${res.status})` });
        return;
      }
      if (props.scope === 'all') {
        const failed = j.failed ?? 0;
        setStatus(
          failed > 0
            ? { kind: 'err', msg: `${j.synced ?? 0} synced, ${failed} failed` }
            : { kind: 'ok', msg: `Synced ${j.synced ?? 0}` },
        );
      } else {
        setStatus(
          j.ok ? { kind: 'ok', msg: 'Synced ✓' } : { kind: 'err', msg: j.error ?? 'Failed' },
        );
      }
      router.refresh();
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      setStatus({
        kind: 'err',
        msg: aborted ? 'Timed out — feed is very slow' : 'Network error',
      });
    } finally {
      clearTimeout(t);
    }
  }

  const base =
    props.className ??
    (props.scope === 'all'
      ? 'rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted'
      : 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90');

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={status.kind === 'busy'}
        className={`${base} disabled:opacity-60`}
      >
        {status.kind === 'busy' ? 'Syncing…' : label}
      </button>
      {status.kind === 'ok' ? (
        <span className="text-[11px] text-green-700">{status.msg}</span>
      ) : null}
      {status.kind === 'err' ? (
        <span className="text-[11px] text-red-700">{status.msg}</span>
      ) : null}
    </span>
  );
}
