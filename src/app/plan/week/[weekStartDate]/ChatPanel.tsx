'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { parseSseEvents, type SseEvent } from '@/lib/sse';

export type WeeklyChatPanelInitial = {
  sessionId: string | null;
  currentPriority: { id: string; name: string; color: string } | null;
  weekRangeLabel: string;
  quarterFocusLabel: string | null;
  initialMessages: { role: 'user' | 'assistant'; text: string }[];
};

type DisplayMessage = {
  role: 'user' | 'assistant';
  text: string;
  tools: Array<{
    id: string;
    name: string;
    inputSummary: string;
    status: 'pending' | 'ok' | 'error';
    statusText?: string;
  }>;
};

type Banner =
  | { tone: 'error'; message: string }
  | { tone: 'warning'; message: string };

type Props = {
  initial: WeeklyChatPanelInitial;
};

export function ChatPanel({ initial }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initial.initialMessages.map((m) => ({ role: m.role, text: m.text, tools: [] })),
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [signaledDone, setSignaledDone] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Reset only on session change (M12 hotfix carries over).
  useEffect(() => {
    setMessages(initial.initialMessages.map((m) => ({ role: m.role, text: m.text, tools: [] })));
    setSignaledDone(false);
    setBanner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.sessionId]);

  if (!initial.currentPriority || !initial.sessionId) {
    return (
      <div className="rounded-md border border-green-600/30 bg-green-600/5 p-4 text-sm text-green-700">
        All priorities planned for this week. Tap{' '}
        <a href="/priorities" className="underline">
          Council
        </a>{' '}
        to head back.
      </div>
    );
  }

  const priority = initial.currentPriority;
  const focusLine = initial.quarterFocusLabel
    ? `The quarter focus for this week is **${initial.quarterFocusLabel}**.`
    : `(No quarter focus set for this week yet.)`;
  const opener =
    messages.length === 0
      ? `Let's plan the week of ${initial.weekRangeLabel} for **${priority.name}**.\n\n${focusLine}\n\nWhat's worth scheduling? You can describe the shape of the week or jump straight to specific tasks/events.`
      : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userText = input.trim();
    setInput('');
    setBanner(null);
    setSignaledDone(false);

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: userText, tools: [] },
      { role: 'assistant', text: '', tools: [] },
    ]);
    setStreaming(true);

    try {
      const res = await fetch('/api/plan/week/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: initial.sessionId, message: userText }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
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
        applySseEvent(event);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'stream failed';
      setBanner({ tone: 'error', message: m });
    } finally {
      setStreaming(false);
    }
  }

  function applySseEvent(event: SseEvent) {
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
    if (event.type === 'tool_use_start') {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            tools: [
              ...last.tools,
              {
                id: event.id,
                name: event.name,
                inputSummary: shortSummary(event.input),
                status: 'pending',
              },
            ],
          };
        }
        return next;
      });
      return;
    }
    if (event.type === 'tool_result') {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            tools: last.tools.map((t) =>
              t.id === event.id
                ? {
                    ...t,
                    status: event.ok ? 'ok' : 'error',
                    statusText: event.ok ? 'saved' : event.reason,
                  }
                : t,
            ),
          };
        }
        return next;
      });
      if (event.ok) router.refresh();
      return;
    }
    if (event.type === 'message_done') return;
    if (event.type === 'signal_done') {
      setSignaledDone(true);
      return;
    }
    if (event.type === 'cost_blocked') {
      setBanner({
        tone: 'error',
        message: `${event.reason}. (Today: $${event.todayUsd.toFixed(4)} of $${event.dailyCapUsd.toFixed(2)} · Month: $${event.monthUsd.toFixed(4)} of $${event.monthlyCapUsd.toFixed(2)})`,
      });
      return;
    }
    if (event.type === 'lock_busy') {
      setBanner({
        tone: 'warning',
        message: `Another weekly-planning session is in progress. Try again in ~${Math.ceil(event.try_again_in_ms / 1000)}s.`,
      });
      return;
    }
    if (event.type === 'error') {
      setBanner({ tone: 'error', message: event.message });
      return;
    }
  }

  async function finishOrSkip(action: 'finish' | 'skip') {
    if (!initial.sessionId) return;
    setStreaming(true);
    try {
      const res = await fetch(`/api/plan/week/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: initial.sessionId }),
      });
      if (!res.ok) {
        setBanner({ tone: 'error', message: `${action} failed (${res.status}).` });
        return;
      }
      router.refresh();
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'failed',
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Chat — <span className="font-normal">{priority.name}</span>
      </summary>

      <div className="mt-3 space-y-3">
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
                {m.role}
              </div>
              <div className="mt-1 whitespace-pre-wrap">
                {m.text || (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
              {m.tools.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {m.tools.map((t) => (
                    <li
                      key={t.id}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                        t.status === 'pending'
                          ? 'border-border bg-background text-muted-foreground'
                          : t.status === 'ok'
                            ? 'border-green-600/30 bg-green-600/5 text-green-700'
                            : 'border-red-600/30 bg-red-600/5 text-red-700'
                      }`}
                    >
                      <span className="font-mono">{t.name}</span>
                      <span className="opacity-70">{t.inputSummary}</span>
                      {t.statusText ? <span className="ml-1">· {t.statusText}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
          <div ref={messagesEndRef} />
        </ul>

        {signaledDone ? (
          <div className="space-y-2 rounded-md border border-green-600/30 bg-green-600/5 p-3">
            <p className="text-sm text-green-700">
              {priority.name} has signaled it&apos;s done planning the week.
              You can keep going if there&apos;s more, or move to the next
              Priority.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSignaledDone(false)}
                disabled={streaming}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Keep planning
              </button>
              <button
                type="button"
                onClick={() => finishOrSkip('finish')}
                disabled={streaming}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Finish &amp; Next
              </button>
              <button
                type="button"
                onClick={() => finishOrSkip('skip')}
                disabled={streaming}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Skip without saving
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              maxLength={4000}
              disabled={streaming}
              placeholder={messages.length === 0 ? 'Reply with the shape of the week…' : 'Reply…'}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary disabled:opacity-50"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={streaming || input.trim().length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {streaming ? 'Sending…' : 'Send'}
              </button>
              <button
                type="button"
                onClick={() => finishOrSkip('skip')}
                disabled={streaming}
                className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Skip this Priority
              </button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}

function shortSummary(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input.length > 60 ? `${input.slice(0, 60)}…` : input;
  try {
    const j = JSON.stringify(input);
    return j.length > 60 ? `${j.slice(0, 60)}…` : j;
  } catch {
    return '';
  }
}
