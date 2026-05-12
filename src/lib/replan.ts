import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatSessions, type ChatSession } from '@/db/schema';
import type { SessionType } from '@/lib/chat-sessions';

/**
 * Returns true if every priority in `queue` has at least one CLOSED chat
 * session for `(sessionType, contextRef)`. Used by the planning pages to
 * decide whether to show the re-planning mode picker.
 *
 * A horizon is "complete" only when the user has walked through every
 * queue priority's conversation at least once. Partial progress (some
 * closed, some still open) does NOT trigger the picker — the page just
 * resumes from the next un-closed priority (the existing M11-M14 behavior).
 */
export async function isHorizonComplete(
  userId: string,
  sessionType: SessionType,
  contextRef: string,
  queuePriorityIds: string[],
): Promise<boolean> {
  if (queuePriorityIds.length === 0) return false;
  const rows = await db
    .select({ priorityId: chatSessions.priorityId })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, sessionType),
        eq(chatSessions.contextRef, contextRef),
        isNotNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
        inArray(chatSessions.priorityId, queuePriorityIds),
      ),
    );
  const closedSet = new Set(rows.map((r) => r.priorityId).filter((v): v is string => !!v));
  return queuePriorityIds.every((id) => closedSet.has(id));
}

/**
 * "Replan all" — delete every chat session for `(user, sessionType,
 * contextRef)`. The FK on `chat_messages.session_id` cascades, so
 * messages disappear too. Plan artifacts that the chatbot wrote via tool
 * calls (quarter_week_focus rows, tasks, events, time_block_*) are
 * intentionally NOT touched — the second pass conversations can re-confirm
 * or revise them via further tool calls.
 *
 * Returns the number of sessions removed.
 */
export async function deleteSessionsForHorizon(
  userId: string,
  sessionType: SessionType,
  contextRef: string,
): Promise<number> {
  const result = await db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, sessionType),
        eq(chatSessions.contextRef, contextRef),
      ),
    )
    .returning({ id: chatSessions.id });
  return result.length;
}

/**
 * "Adjust one" — find the latest closed session for `(user, sessionType,
 * contextRef, priorityId)` and clear its `closed_at` so the chat panel
 * surfaces it again. Returns the reopened session, or null if no closed
 * session exists for that priority (e.g. the page state is stale).
 */
export async function reopenSession(
  userId: string,
  sessionType: SessionType,
  contextRef: string,
  priorityId: string,
): Promise<ChatSession | null> {
  const candidates = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, sessionType),
        eq(chatSessions.contextRef, contextRef),
        eq(chatSessions.priorityId, priorityId),
        isNotNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    )
    .orderBy(desc(chatSessions.openedAt))
    .limit(1);

  const latest = candidates[0];
  if (!latest) return null;

  const [updated] = await db
    .update(chatSessions)
    .set({ closedAt: null })
    .where(and(eq(chatSessions.id, latest.id), eq(chatSessions.userId, userId)))
    .returning();
  return updated ?? null;
}
