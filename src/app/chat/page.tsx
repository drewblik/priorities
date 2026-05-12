import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Link from 'next/link';
import { requireUser } from '@/auth';
import { loadThread } from '@/lib/chat-messages';
import { getOrCreateMasterSession } from '@/lib/chat-sessions';
import {
  parseScreenContextFromPath,
  sanitizeFromPath,
} from '@/lib/master-chat-screen-context';
import { unpackMasterChatAssistantBlocks } from '@/lib/master-chat-tools';
import { getPrioritiesForUser } from '@/lib/priorities';
import { MasterChatPanel, type MasterChatInitial } from './MasterChatPanel';

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

  const thread = await loadThread(chatSession.id);
  const initialMessages = thread
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-40) // sensible cap; M17 adds proper scrollback pagination
    .map(
      (m): { role: 'user' | 'assistant'; text: string; needsClarification?: boolean } => {
        if (m.role === 'user') {
          const text = typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content);
          return { role: 'user', text };
        }
        // Assistant rows in the master chat thread store the raw content
        // array including the `submit_preview` tool_use block. Pull the
        // display text + clarification flag from it.
        const unpacked = unpackMasterChatAssistantBlocks(
          m.content as ContentBlockParam[] | string,
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

  const initial: MasterChatInitial = {
    initialMessages,
    priorityById,
    screenContext,
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
