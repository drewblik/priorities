import type { ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatMessages, type ChatMessage } from '@/db/schema';
import { newId } from '@/lib/id';

/**
 * Load the conversation thread for a session as Anthropic-shape
 * MessageParam[]. Tool-result rows are emitted as user-role messages
 * (Anthropic's convention for injecting tool_result blocks back into the
 * model's history).
 */
export async function loadThread(sessionId: string): Promise<MessageParam[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  return rows.map(rowToMessageParam);
}

function rowToMessageParam(row: ChatMessage): MessageParam {
  // role='tool_result' rows are user-role wrappers around tool_result blocks.
  if (row.role === 'tool_result') {
    return { role: 'user', content: row.content as ContentBlockParam[] };
  }
  // role='user' or 'assistant' — content is either string or block array.
  return {
    role: row.role as 'user' | 'assistant',
    content: row.content as string | ContentBlockParam[],
  };
}

export async function appendUserMessage(sessionId: string, text: string): Promise<void> {
  await db.insert(chatMessages).values({
    id: newId('chm'),
    sessionId,
    role: 'user',
    content: text,
  });
}

export async function appendAssistantMessage(
  sessionId: string,
  content: ContentBlockParam[],
  costUsd: number,
): Promise<void> {
  await db.insert(chatMessages).values({
    id: newId('chm'),
    sessionId,
    role: 'assistant',
    content,
    costUsd: costUsd.toFixed(6),
  });
}

export async function appendToolResult(
  sessionId: string,
  toolResultBlocks: ContentBlockParam[],
): Promise<void> {
  await db.insert(chatMessages).values({
    id: newId('chm'),
    sessionId,
    role: 'tool_result',
    content: toolResultBlocks,
  });
}

/**
 * Strip the simple text representation of an assistant turn for client
 * display. Concatenates all text blocks; ignores tool_use blocks (the
 * server emits separate SSE events for those).
 */
export function extractAssistantText(blocks: ContentBlockParam[]): string {
  return blocks
    .filter(
      (b): b is Extract<ContentBlockParam, { type: 'text' }> => b.type === 'text',
    )
    .map((b) => b.text)
    .join('');
}
