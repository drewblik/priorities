'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { parseSseEvents, type SseEvent } from '@/lib/sse';

export type OnboardingInitial = {
  initialMessages: { role: 'user' | 'assistant'; text: string }[];
};

type DisplayMessage = { role: 'user' | 'assistant'; text: string };

type Banner = { tone: 'error' | 'warning'; message: string };

const OPENER =
  "Hi — I'm your Onboarding Coach. I'll ask about the main areas of your life " +
  "(work, health, relationships, hobbies, finances, ambitions, anything new) so " +
  "Priorities can propose a starter council for you. Takes about 10–15 minutes. " +
  "To kick off: tell me a bit about your work or what you do day to day.";

export function OnboardingChatPanel({ initial }: { initial: OnboardingInitial }) {
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>(() => initial.initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, banner]);

  const opener = messages.length === 0 ? OPENER : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming || proposing) return;
    const userText = input.trim();
    setInput('');
    setBanner(null);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: userText },
      { role: 'assistant', text: '' },
    ]);
    setStreaming(true);
    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setBanner({ tone: 'error', message: j?.message ?? `Chat failed (${res.status}).` });
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (!res.body) {
        setBanner({ tone: 'error', message: 'No response stream.' });
        return;
      }
      const reader = res.body.getReader();
      for await (const event of parseSseEvents(reader)) {
        applyEvent(event);
      }
    } catch (err) {
      setBanner({ tone: 'error', message: err instanceof Error ? err.message : 'stream failed' });
    } finally {
      setStreaming(false);
    }
  }

  function applyEvent(event: SseEvent) {
    if (event.type === 'text_delta') {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { ...last, text: last.text + event.text };
        }
        return next;
      });
      return;
    }
    if (event.type === 'cost_blocked') {
      setBanner({ tone: 'error', message: event.reason });
      return;
    }
    if (event.type === 'lock_busy') {
      setBanner({
        tone: 'warning',
        message: `Another onboarding action is in progress. Try again in ~${Math.ceil(
          event.try_again_in_ms / 1000,
        )}s.`,
      });
      return;
    }
    if (event.type === 'error') {
      setBanner({ tone: 'error', message: event.message });
    }
  }

  async function propose() {
    if (streaming || proposing) return;
    setProposing(true);
    setBanner(null);
    try {
      const res = await fetch('/api/onboarding/propose', { method: 'POST' });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setBanner({
          tone: 'error',
          message: j?.message ?? `Couldn't generate a proposal (${res.status}).`,
        });
        return;
      }
      const j = (await res.json()) as { ok: boolean; proposal: unknown };
      // Hand the proposal to the review page via sessionStorage (survives
      // refresh within the tab; cleared after accept).
      sessionStorage.setItem('council_proposal', JSON.stringify(j.proposal));
      router.push('/onboarding/proposal');
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'proposal failed',
      });
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="space-y-3">
      {banner ? (
        <div
          role="alert"
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.tone === 'error'
              ? 'border-red-600/30 bg-red-600/5 text-red-700'
              : 'border-amber-600/30 bg-amber-600/5 text-amber-700'
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <ul className="space-y-3">
        {opener ? (
          <li className="rounded-md bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
            {opener}
          </li>
        ) : null}
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.role === 'user'
                ? 'rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'
                : 'rounded-md bg-muted/40 px-3 py-2 text-sm'
            }
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {m.role === 'user' ? 'you' : 'coach'}
            </div>
            <div className="mt-1 whitespace-pre-wrap">
              {m.text || (streaming && i === messages.length - 1 ? '…' : '')}
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>

      <form onSubmit={send} className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          maxLength={4000}
          disabled={streaming || proposing}
          placeholder="Tell the Coach about this part of your life…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={streaming || proposing || input.trim().length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {streaming ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={propose}
            disabled={streaming || proposing || messages.length === 0}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {proposing ? 'Generating…' : "I'm done — propose my council"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Answer as much or as little as you like. When you&apos;ve covered
          what matters, tap <span className="font-medium">propose my council</span>{' '}
          and you&apos;ll get a starter set you can edit before anything is saved.
        </p>
      </form>
    </div>
  );
}
