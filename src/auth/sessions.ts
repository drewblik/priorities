import { randomBytes, createHash } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, users, type User } from '@/db/schema';
import { SESSION_TTL_DAYS } from './cookie';

const SESSION_TOKEN_BYTES = 24;
const RENEWAL_THRESHOLD_DAYS = 15;

function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export type SessionWithUser = {
  sessionId: string;
  user: User;
  expiresAt: Date;
};

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const sessionId = hashToken(token);
  const expiresAt = daysFromNow(SESSION_TTL_DAYS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<SessionWithUser | null> {
  const sessionId = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.session.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  if (row.user.deletedAt) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Sliding renewal: extend if more than half-expired.
  const renewalCutoff = daysFromNow(RENEWAL_THRESHOLD_DAYS);
  let expiresAt = row.session.expiresAt;
  if (row.session.expiresAt < renewalCutoff) {
    expiresAt = daysFromNow(SESSION_TTL_DAYS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
  }

  return { sessionId, user: row.user, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  const sessionId = hashToken(token);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
