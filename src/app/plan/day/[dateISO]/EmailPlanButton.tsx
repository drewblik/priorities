'use client';

import { useState } from 'react';

type Status = { ok: boolean; msg: string } | null;

/**
 * Sends a plain-text sticky-note copy of the day's plan to the signed-in
 * user's account email. Manual / opt-in — not wired to any planning step
 * completion. Lives at the top of the day plan page.
 */
export function EmailPlanButton({ dateISO }: { dateISO: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/plan/day/${dateISO}/email`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const msg =
          j?.error === 'send_failed'
            ? 'Send failed — try again in a moment.'
            : j?.error === 'invalid_date'
              ? 'Invalid date.'
              : `Could not send (${res.status}).`;
        setStatus({ ok: false, msg });
        return;
      }
      setStatus({ ok: true, msg: 'Sent ✓' });
    } catch (err) {
      setStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'Network error.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Email me this plan'}
      </button>
      {status ? (
        <span
          className={`text-xs ${status.ok ? 'text-green-700' : 'text-red-700'}`}
          role="status"
        >
          {status.msg}
        </span>
      ) : null}
    </div>
  );
}
