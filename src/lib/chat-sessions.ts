import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatSessions, type ChatSession } from '@/db/schema';
import { newId } from '@/lib/id';

export type SessionType = 'onboarding' | 'creation' | 'quarter' | 'weekly' | 'daily' | 'master';

export type CreateSessionInput = {
  userId: string;
  sessionType: SessionType;
  contextRef?: string | null;
  priorityId?: string | null;
};

/**
 * Find an open session for (user, type, contextRef, priorityId), or create
 * one. Used at the top of a planning route to get the active session for
 * the current Priority in the queue.
 */
export async function getOrCreateSession(input: CreateSessionInput): Promise<ChatSession> {
  const existing = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, input.userId),
        eq(chatSessions.sessionType, input.sessionType),
        input.contextRef
          ? eq(chatSessions.contextRef, input.contextRef)
          : isNull(chatSessions.contextRef),
        input.priorityId
          ? eq(chatSessions.priorityId, input.priorityId)
          : isNull(chatSessions.priorityId),
        isNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    )
    .orderBy(desc(chatSessions.openedAt))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(chatSessions)
    .values({
      id: newId('chs'),
      userId: input.userId,
      sessionType: input.sessionType,
      contextRef: input.contextRef ?? null,
      priorityId: input.priorityId ?? null,
    })
    .returning();
  if (!created) throw new Error('chat_session_insert_failed');
  return created;
}

/** Find CLOSED sessions (closed_at IS NOT NULL) for a (user, type,
 *  contextRef) tuple. Used to compute queue state — "which priorities
 *  are done". An open session for the current priority is intentionally
 *  excluded. */
export async function getClosedSessions(
  userId: string,
  sessionType: SessionType,
  contextRef: string,
): Promise<ChatSession[]> {
  return db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, sessionType),
        eq(chatSessions.contextRef, contextRef),
        isNotNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    );
}

export async function getSessionByIdForUser(
  userId: string,
  id: string,
): Promise<ChatSession | null> {
  const rows = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Find or create the long-lived master chat session for a user. Master
 * Chat (M16) is a single session_type='master' row per user with
 * `context_ref=null` and `priority_id=null` — used as the canonical chat
 * thread for the always-available router across all pages.
 */
export async function getOrCreateMasterSession(userId: string): Promise<ChatSession> {
  const existing = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, 'master'),
        isNull(chatSessions.contextRef),
        isNull(chatSessions.priorityId),
        isNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    )
    .orderBy(desc(chatSessions.openedAt))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(chatSessions)
    .values({
      id: newId('chs'),
      userId,
      sessionType: 'master',
      contextRef: null,
      priorityId: null,
    })
    .returning();
  if (!created) throw new Error('master_session_insert_failed');
  return created;
}

export async function closeSession(userId: string, id: string): Promise<boolean> {
  const result = await db
    .update(chatSessions)
    .set({ closedAt: new Date() })
    .where(
      and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    )
    .returning({ id: chatSessions.id });
  return result.length > 0;
}
