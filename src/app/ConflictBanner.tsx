'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Read-only calendar-conflict nudge (M20). External calendar events are
 * immovable and take precedence; when freshly-synced feed events overlap
 * the user's planned time blocks, this points them at /conflicts.
 * Dismissal is keyed by the conflict count so a NEW/changed conflict
 * re-surfaces instead of staying hidden (conflicts are urgent, unlike the
 * mid-cycle nudge). M21 adds the Master-Chat-driven resolve flow.
 */
export function ConflictBanner({ count }: { count: number }) {
  const [dismissed, setDismissed] = useState(true);
  const key = `conflict_dismissed_${count}`;

  useEffect(() => {
    if (count <= 0) return;
    setDismissed(sessionStorage.getItem(key) === '1');
  }, [count, key]);

  if (count <= 0 || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700">
      <span>
        ⚠️ {count} calendar {count === 1 ? 'conflict' : 'conflicts'} — a
        synced calendar event now overlaps planned time.
      </span>
      <span className="flex items-center gap-2">
        <Link
          href="/conflicts"
          className="rounded-md border border-red-600/40 px-2 py-1 text-xs font-medium hover:bg-red-600/10"
        >
          Review
        </Link>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(key, '1');
            setDismissed(true);
          }}
          className="rounded-md px-2 py-1 text-xs text-red-700 hover:underline"
        >
          Dismiss
        </button>
      </span>
    </div>
  );
}
