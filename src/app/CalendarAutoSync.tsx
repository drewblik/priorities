'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const LS_KEY = 'last_calendar_autosync';
const THROTTLE_MS = 5 * 60 * 1000; // match the server 5-min freshness window

/**
 * Non-blocking calendar freshness. Pages render instantly with the last
 * synced data; this fires `/api/calendar-feeds/sync-all` on mount (throttled
 * to once / 5 min via localStorage), shows an honest "Syncing calendar…"
 * pill while the slow external feed (esp. Outlook) is fetched in its own
 * 60s request, then router.refresh() so conflicts/calendars reflect the
 * fresh data. Replaces the M20 blocking sync-before-plan, which froze the
 * page for up to 30s on slow Outlook feeds.
 */
export function CalendarAutoSync() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'slow'>('idle');

  useEffect(() => {
    const last = Number(localStorage.getItem(LS_KEY) ?? '0');
    if (Date.now() - last < THROTTLE_MS) return;

    let cancelled = false;
    const ctrl = new AbortController();
    // Hard cap so the pill can NEVER stick (Vercel kills the function at
    // 60s; give a little headroom then give up cleanly).
    const cap = setTimeout(() => ctrl.abort(), 70_000);

    setState('syncing');
    // Mark attempted up-front so a slow/failed feed doesn't re-trigger on
    // every navigation within the throttle window.
    localStorage.setItem(LS_KEY, String(Date.now()));

    fetch('/api/calendar-feeds/sync-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((j: { ok?: boolean; total?: number; failed?: number } | null) => {
        if (cancelled) return;
        if (j && (j.failed ?? 0) > 0) {
          setState('slow');
        } else {
          setState('done');
          if (j && (j.total ?? 0) > 0) router.refresh();
        }
        setTimeout(() => !cancelled && setState('idle'), 3000);
      })
      .catch(() => {
        if (!cancelled) {
          setState('slow');
          setTimeout(() => !cancelled && setState('idle'), 4000);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(cap);
      ctrl.abort();
    };
    // Run once per mount; route changes remount the page tree anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'idle') return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-md"
      role="status"
      aria-live="polite"
    >
      {state === 'syncing' ? (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Syncing calendar…
        </>
      ) : state === 'slow' ? (
        <>
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Calendar slow/failed — retry in Settings
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-green-600" />
          Calendar up to date
        </>
      )}
    </div>
  );
}
