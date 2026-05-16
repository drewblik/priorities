'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { MasterChatResponse } from '@/lib/master-chat-tools';
import type { ScreenContext } from '@/lib/master-chat-screen-context';
import { PreviewCard } from './PreviewCard';

export type MasterChatInitial = {
  initialMessages: {
    role: 'user' | 'assistant';
    text: string;
    /** Hydrated from prior `submit_preview` tool_use blocks: when true,
     *  the assistant bubble renders with the amber clarification badge. */
    needsClarification?: boolean;
  }[];
  priorityById: Record<string, { name: string; color: string }>;
  screenContext: ScreenContext;
  /** Pagination cursor for "Load older": the oldest message's createdAt
   *  in the initial page. Null if there are no messages at all. */
  oldestCreatedAt: string | null;
  /** True iff there could be older messages beyond the initial page. */
  hasMoreOlder: boolean;
};

type DisplayMessage = {
  role: 'user' | 'assistant';
  text: string;
  /** When true, the assistant bubble shows a "needs clarification" badge
   *  so the user can distinguish a question-back from an action proposal
   *  or a plain ack. Only relevant for assistant rows. */
  needsClarification?: boolean;
};

type Banner =
  | { tone: 'error'; message: string }
  | { tone: 'warning'; message: string }
  | { tone: 'info'; message: string };

export function MasterChatPanel({ initial }: { initial: MasterChatInitial }) {
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>(() => initial.initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<MasterChatResponse | null>(null);
  const [previewGeneratedAt, setPreviewGeneratedAt] = useState<string | null>(null);
  const [entityById, setEntityById] = useState<
    Record<string, { kind: 'task' | 'event'; title: string }>
  >({});
  const [banner, setBanner] = useState<Banner | null>(null);
  /** Pagination state for "Load older". Initial cursor is the oldest
   *  message's createdAt; hasMore starts at whether the initial page was
   *  full. */
  const [olderCursor, setOlderCursor] = useState<string | null>(initial.oldestCreatedAt);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean>(initial.hasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const priorityMap = new Map(
    Object.entries(initial.priorityById).map(([id, meta]) => [id, meta]),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, preview, banner]);

  async function loadOlder() {
    if (loadingOlder || !hasMoreOlder || !olderCursor) return;
    setLoadingOlder(true);
    try {
      const url = new URL('/api/chat/master/history', window.location.origin);
      url.searchParams.set('before', olderCursor);
      url.searchParams.set('limit', '40');
      const res = await fetch(url.toString());
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setBanner({
          tone: 'error',
          message: j?.message ?? `Couldn't load older messages (${res.status}).`,
        });
        return;
      }
      const j = (await res.json()) as {
        messages: DisplayMessage[];
        hasMore: boolean;
        nextBefore: string | null;
      };
      if (j.messages.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setMessages((prev) => [...j.messages, ...prev]);
      setOlderCursor(j.nextBefore);
      setHasMoreOlder(j.hasMore);
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'history fetch failed',
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;

    const userText = input.trim();
    setInput('');
    setBanner(null);
    setPreview(null);
    // Optimistically push the user bubble; on any non-success path below
    // we rollback by trimming the last message so failed sends don't leave
    // ghost user copies in state.
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setBusy(true);

    let succeeded = false;
    try {
      const res = await fetch('/api/chat/master', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          screen_context: initial.screenContext,
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setBanner({
          tone: 'error',
          message: j?.message ?? `Master chat failed (${res.status}).`,
        });
        return;
      }

      const j = (await res.json()) as {
        ok: boolean;
        response: MasterChatResponse;
        preview_generated_at?: string;
        entity_refs?: { kind: 'task' | 'event'; id: string; title: string }[];
      };

      const r = j.response;
      setPreviewGeneratedAt(j.preview_generated_at ?? null);
      if (Array.isArray(j.entity_refs)) {
        const map: Record<string, { kind: 'task' | 'event'; title: string }> = {};
        for (const e of j.entity_refs) map[e.id] = { kind: e.kind, title: e.title };
        setEntityById(map);
      }

      // needs_clarification → render as a regular assistant text bubble with
      // a "needs clarification" badge; no preview card.
      if (r.needs_clarification && r.needs_clarification.trim().length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: r.needs_clarification as string,
            needsClarification: true,
          },
        ]);
        succeeded = true;
        return;
      }

      // Surface understanding as an assistant message so the user sees what
      // the router thought, even before the preview card.
      if (r.understanding) {
        setMessages((prev) => [...prev, { role: 'assistant', text: r.understanding }]);
      }

      // Always show the preview card (even when proposed_actions is empty —
      // gives the user a chance to elaborate).
      setPreview(r);
      succeeded = true;
    } catch (err) {
      setBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'request failed',
      });
    } finally {
      setBusy(false);
      if (!succeeded) {
        // Roll back the optimistic user bubble — the send didn't land.
        setMessages((prev) => prev.slice(0, -1));
      }
    }
  }

  function cancelPreview() {
    setPreview(null);
    setPreviewGeneratedAt(null);
  }

  // Append a result bubble to the thread so feedback lands where the user
  // is looking (auto-scrolls via the endRef effect) rather than only as a
  // top-of-panel banner that's off-screen on a long thread.
  function pushResultBubble(text: string) {
    setMessages((prev) => [...prev, { role: 'assistant', text }]);
  }

  async function confirmPreview() {
    if (confirming) return;
    if (!preview) return;
    if (!previewGeneratedAt) {
      // Defensive: never silently no-op. This shouldn't happen for a
      // freshly-generated preview, but if it does, tell the user.
      pushResultBubble(
        '⚠️ This preview is stale (lost its timestamp). Send your message again to get a fresh one.',
      );
      setPreview(null);
      return;
    }
    setConfirming(true);
    setBanner(null);
    try {
      const res = await fetch('/api/chat/master/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preview_generated_at: previewGeneratedAt,
          response: preview,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
          failed_action_index?: number;
        } | null;
        const detail =
          typeof j?.failed_action_index === 'number'
            ? ` (action #${j.failed_action_index + 1})`
            : '';
        // Surface both as a banner AND a thread bubble so it's visible
        // regardless of scroll position.
        const msg = `⚠️ ${j?.message ?? `Confirm failed (${res.status}).`}${detail}`;
        setBanner({ tone: 'error', message: msg });
        pushResultBubble(msg);
        return;
      }
      const j = (await res.json()) as {
        ok: boolean;
        executed: Array<{ type: string; entity_id: string | null }>;
      };
      const count = j.executed.length;
      pushResultBubble(`✅ Saved ${count} action${count === 1 ? '' : 's'}.`);
      setPreview(null);
      setPreviewGeneratedAt(null);
      // Pre-warm any source page (e.g., DayCalendar) so the user sees the
      // new data when they navigate back.
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'confirm failed';
      setBanner({ tone: 'error', message: msg });
      pushResultBubble(`⚠️ ${msg}`);
    } finally {
      setConfirming(false);
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
              : banner.tone === 'warning'
                ? 'border-amber-600/30 bg-amber-600/5 text-amber-700'
                : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <ul className="space-y-3">
        {hasMoreOlder && olderCursor ? (
          <li className="flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {loadingOlder ? 'Loading…' : '↑ Load older'}
            </button>
          </li>
        ) : null}

        {messages.length === 0 ? (
          <li className="rounded-md bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
            Ask the council anything. Examples:
            {'\n'}• &ldquo;Add note to Chef: try Korean BBQ next week.&rdquo;
            {'\n'}• &ldquo;Skip tomorrow&apos;s gym and reschedule to Friday 5pm.&rdquo;
            {'\n'}• &ldquo;Mark today&apos;s morning routine as done.&rdquo;
          </li>
        ) : null}
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.role === 'user'
                ? 'rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'
                : m.needsClarification
                  ? 'rounded-md border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-sm'
                  : 'rounded-md bg-muted/40 px-3 py-2 text-sm'
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.role}
              </span>
              {m.needsClarification ? (
                <span className="rounded-full border border-amber-600/30 bg-amber-600/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                  💭 needs clarification
                </span>
              ) : null}
            </div>
            <div className="mt-1 whitespace-pre-wrap">{m.text}</div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>

      {preview ? (
        <PreviewCard
          preview={preview}
          priorityById={priorityMap}
          entityById={entityById}
          onCancel={cancelPreview}
          onConfirm={confirmPreview}
          busy={confirming}
        />
      ) : null}

      <form onSubmit={send} className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          maxLength={4000}
          disabled={busy}
          placeholder="Tell the council what's up…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Routing…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
