'use client';

import { useEffect, useMemo, useState } from 'react';

type Status = { ok: boolean; msg: string } | null;

export type EmailDestination = {
  /** Address the email is sent to. */
  email: string;
  /** Human label shown in the picker. For the account email this is just
   *  the email; for a calendar feed it's "<feed name> — <email>". */
  label: string;
};

const STORAGE_KEY = 'priorities:email-plan-destination';

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sends a plain-text sticky-note copy of the day's plan to a chosen
 * address. Default destination = the user's account email; if any
 * connected calendar feeds have a `calendar_email` set, those addresses
 * appear in a small picker beside the button. Last choice is remembered
 * per-device via localStorage.
 *
 * The API route re-validates the chosen address against the user's
 * allowed list, so the picker is a UX affordance, not a trust boundary.
 */
export function EmailPlanButton({
  dateISO,
  accountEmail,
  feedDestinations,
}: {
  dateISO: string;
  accountEmail: string;
  feedDestinations: EmailDestination[];
}) {
  const options: EmailDestination[] = useMemo(() => {
    const accountKey = normalize(accountEmail);
    // De-dupe a feed email that's the same as the account email.
    const extras = feedDestinations.filter(
      (d) => normalize(d.email) !== accountKey,
    );
    return [{ email: accountEmail, label: accountEmail }, ...extras];
  }, [accountEmail, feedDestinations]);

  const [selected, setSelected] = useState<string>(accountEmail);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // Hydrate from localStorage on mount, but only if the stored choice is
  // still one of this user's allowed options (e.g. they might have
  // removed the feed since last visit).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const match = options.find((o) => normalize(o.email) === normalize(stored));
    if (match) setSelected(match.email);
  }, [options]);

  function onChangeDestination(email: string) {
    setSelected(email);
    setStatus(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, email);
    } catch {
      // localStorage can be unavailable (private browsing limits, quota,
      // etc.). The picker still works for this session; we just don't
      // remember the choice.
    }
  }

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/plan/day/${dateISO}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: selected }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;
        const msg =
          j?.error === 'send_failed'
            ? j?.detail
              ? `Send failed: ${j.detail}`
              : 'Send failed — try again in a moment.'
            : j?.error === 'invalid_date'
              ? 'Invalid date.'
              : j?.error === 'invalid_destination'
                ? 'That destination is no longer allowed — pick another.'
                : `Could not send (${res.status}).`;
        setStatus({ ok: false, msg });
        return;
      }
      setStatus({ ok: true, msg: `Sent ✓ to ${selected}` });
    } catch (err) {
      setStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'Network error.',
      });
    } finally {
      setBusy(false);
    }
  }

  const showPicker = options.length > 1;

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
      {showPicker ? (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>to</span>
          <select
            value={selected}
            onChange={(e) => onChangeDestination(e.target.value)}
            disabled={busy}
            className="max-w-[16rem] truncate rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-50"
          >
            {options.map((o) => (
              <option key={normalize(o.email)} value={o.email}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
