import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { and, desc, eq, lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { db } from '@/db/client';
import { chatMessages } from '@/db/schema';
import { getOrCreateMasterSession } from '@/lib/chat-sessions';
import { unpackMasterChatAssistantBlocks } from '@/lib/master-chat-tools';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const beforeRaw = url.searchParams.get('before');
  const limitRaw = url.searchParams.get('limit');

  let before: Date | null = null;
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'invalid_before' }, { status: 400 });
    }
    before = d;
  }
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT),
  );

  const masterSession = await getOrCreateMasterSession(session.user.id);

  const conditions = [eq(chatMessages.sessionId, masterSession.id)];
  if (before) conditions.push(lt(chatMessages.createdAt, before));

  // Pull `limit` rows ORDER BY created_at DESC, then reverse to oldest-first
  // so the client can simply prepend the page to its messages array.
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  const messages = rows
    .reverse()
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => {
      if (row.role === 'user') {
        const text =
          typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
        return {
          role: 'user' as const,
          text,
          createdAt: row.createdAt.toISOString(),
        };
      }
      const unpacked = unpackMasterChatAssistantBlocks(
        row.content as ContentBlockParam[] | string,
      );
      return {
        role: 'assistant' as const,
        text: unpacked.displayText,
        needsClarification: unpacked.needsClarification,
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((m) => m.text.trim().length > 0);

  // hasMore = whether the oldest row in this page has anything older.
  // If we got fewer rows than the limit, there's nothing older.
  const hasMore = rows.length >= limit;

  return NextResponse.json({
    ok: true,
    messages,
    hasMore,
    /** Cursor for the next "Load older" call: the oldest createdAt in this
     *  page. Client passes it back as ?before=<this>. */
    nextBefore: messages[0]?.createdAt ?? null,
  });
}
