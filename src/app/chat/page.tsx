import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { requireUser } from '@/auth';
import { db } from '@/db/client';
import { chatMessages } from '@/db/schema';
import { getOrCreateMasterSession } from '@/lib/chat-sessions';
import {
  parseScreenContextFromPath,
  sanitizeFromPath,
} from '@/lib/master-chat-screen-context';
import { unpackMasterChatAssistantBlocks } from '@/lib/master-chat-tools';
import { getPrioritiesForUser } from '@/lib/priorities';
import { MasterChatPanel, type MasterChatInitial } from './MasterChatPanel';

const INITIAL_PAGE_LIMIT = 40;

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function MasterChatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const sp = await searchParams;
  const fromRaw = typeof sp.from === 'string' ? sp.from : null;
  const fromPath = sanitizeFromPath(fromRaw);
  const screenContext = parseScreenContextFromPath(fromPath);

  const [allPriorities, chatSession] = await Promise.all([
    getPrioritiesForUser(session.user.id),
    getOrCreateMasterSession(session.user.id),
  ]);

  // Query the latest INITIAL_PAGE_LIMIT messages directly so we also get
  // createdAt for the "Load older" pagination cursor. Returned DESC; we
  // reverse for chronological display.
  const rowsDesc = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, chatSession.id))
    .orderBy(desc(chatMessages.createdAt))
    .limit(INITIAL_PAGE_LIMIT);

  const rowsAsc = [...rowsDesc].reverse();

  const initialMessages = rowsAsc
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map(
      (row): { role: 'user' | 'assistant'; text: string; needsClarification?: boolean } => {
        if (row.role === 'user') {
          const text =
            typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
          return { role: 'user', text };
        }
        const unpacked = unpackMasterChatAssistantBlocks(
          row.content as ContentBlockParam[] | string,
        );
        return {
          role: 'assistant',
          text: unpacked.displayText,
          needsClarification: unpacked.needsClarification,
        };
      },
    )
    .filter((m) => m.text.trim().length > 0);

  // Build the priority lookup map the PreviewCard needs to colorize chips.
  const priorityById: Record<string, { name: string; color: string }> = {};
  for (const p of allPriorities) {
    priorityById[p.id] = { name: p.name, color: p.icon.color };
  }

  // Pagination cursor: the createdAt of the oldest row in this page. If the
  // page is full (== INITIAL_PAGE_LIMIT), there might be more older rows
  // beyond it.
  const oldestRow = rowsAsc[0]; // asc by createdAt, so first = oldest
  const oldestCreatedAt = oldestRow ? oldestRow.createdAt.toISOString() : null;
  const hasMoreOlder = rowsDesc.length >= INITIAL_PAGE_LIMIT;

  const initial: MasterChatInitial = {
    initialMessages,
    priorityById,
    screenContext,
    oldestCreatedAt,
    hasMoreOlder,
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Master chat</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Routes natural-language commands across your council.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Context: <span className="font-mono">{screenContext.page}</span>
            {screenContext.horizon ? ` · ${screenContext.horizon}` : ''}
          </p>
        </div>
        <Link
          href={fromPath}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
      </header>

      <MasterChatPanel initial={initial} />
    </main>
  );
}
