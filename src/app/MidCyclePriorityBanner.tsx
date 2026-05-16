'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const DISMISS_KEY = 'midcycle_banner_dismissed';

/**
 * Subsystem 11 (minimal): one dismissible nudge shown on Council Home /
 * Today when the user has added active Priorities since their last plan.
 * Server decides whether to render this at all (`show`); the client only
 * handles sessionStorage dismissal so it doesn't nag within a session.
 */
export function MidCyclePriorityBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!show) return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
  }, [show]);

  if (!show || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-sm text-amber-800">
      <span>
        You&apos;ve added Priorities since your last plan. Re-plan to fold
        them in.
      </span>
      <span className="flex items-center gap-2">
        <Link
          href="/plan/week"
          className="rounded-md border border-amber-600/40 px-2 py-1 text-xs font-medium hover:bg-amber-600/10"
        >
          Re-plan
        </Link>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
          className="rounded-md px-2 py-1 text-xs text-amber-700 hover:underline"
        >
          Dismiss
        </button>
      </span>
    </div>
  );
}
