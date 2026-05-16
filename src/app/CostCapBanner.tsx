'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Status = {
  todayUsd: number;
  monthUsd: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  level: 'ok' | 'warn' | 'blocked';
};

const HIDDEN = new Set(['/signin']);

/**
 * App-wide cost banner. Yellow at >=80% of a cap, red ("AI paused") at
 * >=100%. Purely informational — actual enforcement is server-side in
 * withinCostCap before every AI call (M12). Fetched once on mount; the
 * banner re-checks on route change so it updates after AI usage.
 */
export function CostCapBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!pathname || HIDDEN.has(pathname)) return;
    let cancelled = false;
    fetch('/api/cost/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j.level === 'string') setStatus(j as Status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!pathname || HIDDEN.has(pathname)) return null;
  if (!status || status.level === 'ok') return null;

  const blocked = status.level === 'blocked';
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const dailyHit = status.todayUsd >= status.dailyCapUsd;
  const which = dailyHit ? 'daily' : 'monthly';
  const used = dailyHit ? status.todayUsd : status.monthUsd;
  const cap = dailyHit ? status.dailyCapUsd : status.monthlyCapUsd;

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 px-3 py-2 text-center text-sm ${
        blocked
          ? 'bg-red-600 text-white'
          : 'bg-amber-500 text-amber-950'
      }`}
      role="alert"
    >
      {blocked ? (
        <>
          {usd(cap)} {which} cap reached. AI features paused.{' '}
          <Link href="/settings/cost" className="underline">
            Raise cap
          </Link>{' '}
          or wait for reset.
        </>
      ) : (
        <>
          {usd(used)} used ({which}), {usd(cap)} cap.{' '}
          <Link href="/settings/cost" className="underline">
            Manage
          </Link>
        </>
      )}
    </div>
  );
}
