'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  CouncilProposal,
  ProposedPriority,
} from '@/lib/onboarding-proposal-tools';

const ICON_STYLES = ['classic', 'rounded', 'serif', 'script'] as const;
const CADENCES = ['quarterly', 'weekly', 'daily'] as const;

type EditableCard = ProposedPriority & { _include: boolean };

export function ProposalReview({ hasExistingCouncil }: { hasExistingCouncil: boolean }) {
  const router = useRouter();
  const [cards, setCards] = useState<EditableCard[] | null>(null);
  const [rationale, setRationale] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState('');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('council_proposal');
      if (!raw) {
        setLoadError('no_proposal');
        return;
      }
      const proposal = JSON.parse(raw) as CouncilProposal;
      setCards(
        proposal.proposed_priorities.map((p) => ({ ...p, _include: true })),
      );
      setRationale(proposal.rationale ?? '');
    } catch {
      setLoadError('parse_error');
    }
  }, []);

  function patch(i: number, change: Partial<ProposedPriority>) {
    setCards((prev) =>
      prev ? prev.map((c, idx) => (idx === i ? { ...c, ...change } : c)) : prev,
    );
  }
  function toggleInclude(i: number) {
    setCards((prev) =>
      prev ? prev.map((c, idx) => (idx === i ? { ...c, _include: !c._include } : c)) : prev,
    );
  }
  function toggleCadence(i: number, c: 'quarterly' | 'weekly' | 'daily') {
    setCards((prev) => {
      if (!prev) return prev;
      return prev.map((card, idx) => {
        if (idx !== i) return card;
        const has = card.check_in_cadence.includes(c);
        const next = has
          ? card.check_in_cadence.filter((x) => x !== c)
          : [...card.check_in_cadence, c];
        return { ...card, check_in_cadence: next.length > 0 ? next : card.check_in_cadence };
      });
    });
  }

  async function submit(mode: 'fresh' | 'add' | 'replace') {
    if (!cards) return;
    const selected = cards
      .filter((c) => c._include)
      .map(({ _include, ...rest }) => {
        void _include;
        return rest;
      });
    if (selected.length === 0) {
      setSubmitError('Keep at least one Priority.');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/onboarding/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          priorities: selected,
          mode,
          confirm: mode === 'replace' ? replaceConfirm : undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setSubmitError(j?.message ?? `Accept failed (${res.status}).`);
        return;
      }
      sessionStorage.removeItem('council_proposal');
      router.push('/priorities');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'accept failed');
    } finally {
      setBusy(false);
      setShowModeModal(false);
    }
  }

  function onAcceptClick() {
    if (hasExistingCouncil) {
      setShowModeModal(true);
    } else {
      submit('fresh');
    }
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-amber-600/30 bg-amber-600/5 p-4 text-sm text-amber-700">
        No proposal to review. Go back to the interview and tap{' '}
        <span className="font-medium">&ldquo;I&apos;m done — propose my council&rdquo;</span>{' '}
        first.
        <div className="mt-2">
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
          >
            ← Back to interview
          </button>
        </div>
      </div>
    );
  }

  if (!cards) {
    return <p className="text-sm text-muted-foreground">Loading proposal…</p>;
  }

  const includedCount = cards.filter((c) => c._include).length;

  return (
    <div className="space-y-4">
      {rationale ? (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {rationale}
        </p>
      ) : null}

      {submitError ? (
        <div className="rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700">
          {submitError}
        </div>
      ) : null}

      <ul className="space-y-3">
        {cards.map((c, i) => (
          <li
            key={i}
            className={`rounded-md border p-3 ${
              c._include ? 'border-border bg-background' : 'border-dashed border-border bg-muted/30 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: c.icon.color }}
                />
                <input
                  value={c.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-medium outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => toggleInclude(i)}
                className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                {c._include ? 'Remove' : 'Keep'}
              </button>
            </div>

            {c._include ? (
              <div className="mt-3 space-y-2 text-sm">
                <Field label="SMART goal">
                  <textarea
                    value={c.smart_goal}
                    onChange={(e) => patch(i, { smart_goal: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Quarterly strategy">
                  <textarea
                    value={c.quarterly_strategy}
                    onChange={(e) => patch(i, { quarterly_strategy: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Weekly strategy">
                  <textarea
                    value={c.weekly_strategy}
                    onChange={(e) => patch(i, { weekly_strategy: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Daily strategy">
                  <textarea
                    value={c.daily_strategy}
                    onChange={(e) => patch(i, { daily_strategy: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Field label="Min min/wk">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={c.min_minutes_per_week}
                      onChange={(e) =>
                        patch(i, { min_minutes_per_week: Number(e.target.value) || 0 })
                      }
                      className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                    />
                  </Field>
                  <Field label="Max min/wk">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={c.max_minutes_per_week}
                      onChange={(e) =>
                        patch(i, { max_minutes_per_week: Number(e.target.value) || 0 })
                      }
                      className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                    />
                  </Field>
                  <Field label="Icon style">
                    <select
                      value={c.icon.style}
                      onChange={(e) =>
                        patch(i, {
                          icon: { ...c.icon, style: e.target.value as ProposedPriority['icon']['style'] },
                        })
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                    >
                      {ICON_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Cadence">
                  <div className="flex flex-wrap gap-1">
                    {CADENCES.map((cad) => {
                      const on = c.check_in_cadence.includes(cad);
                      return (
                        <button
                          key={cad}
                          type="button"
                          onClick={() => toggleCadence(i, cad)}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            on
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {cad}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                {c.starter_memory_entries.length > 0 ? (
                  <Field label={`Starter memory (${c.starter_memory_entries.length})`}>
                    <ul className="space-y-1">
                      {c.starter_memory_entries.map((m, mi) => (
                        <li
                          key={mi}
                          className="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground"
                        >
                          {m.body}
                        </li>
                      ))}
                    </ul>
                  </Field>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAcceptClick}
          disabled={busy || includedCount === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : `Accept ${includedCount} ${includedCount === 1 ? 'Priority' : 'Priorities'}`}
        </button>
        <span className="text-xs text-muted-foreground">
          You can fine-tune everything later from each Priority&apos;s page.
        </span>
      </div>

      {showModeModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-md border border-border bg-background p-4">
            <h2 className="text-base font-medium">You already have a council</h2>
            <p className="text-sm text-muted-foreground">
              Add these new Priorities to your existing council, or replace it
              entirely?
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => submit('add')}
                disabled={busy}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Add to my council
              </button>
              <div className="rounded-md border border-red-600/30 bg-red-600/5 p-3">
                <p className="text-xs text-red-700">
                  Replace cascade-deletes your current Priorities (past
                  completed Tasks/Events are preserved). Type{' '}
                  <span className="font-mono font-semibold">REPLACE</span> to
                  confirm.
                </p>
                <input
                  value={replaceConfirm}
                  onChange={(e) => setReplaceConfirm(e.target.value)}
                  placeholder="REPLACE"
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-red-600"
                />
                <button
                  type="button"
                  onClick={() => submit('replace')}
                  disabled={busy || replaceConfirm !== 'REPLACE'}
                  className="mt-2 w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Replace my council
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowModeModal(false)}
                disabled={busy}
                className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
