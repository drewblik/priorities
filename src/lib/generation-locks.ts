import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { generationLocks } from '@/db/schema';

const DEFAULT_TTL_SEC = 90;

export type LockResult =
  | { acquired: true }
  | { acquired: false; tryAgainInMs: number };

/**
 * Atomic-claim a (user_id, lock_key) lock. Returns `{ acquired: true }` if
 * we hold the lock, `{ acquired: false, tryAgainInMs }` if someone else
 * holds it (and it isn't stale yet).
 *
 * Stale-lock recovery: if an existing row's `expires_at < now()`, we treat
 * it as released and overwrite it (UPDATE returning 1 row).
 */
export async function acquireLock(
  userId: string,
  lockKey: string,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<LockResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSec * 1000);

  // Try to insert; on conflict, try to overwrite if stale.
  const inserted = await db
    .insert(generationLocks)
    .values({ userId, lockKey, acquiredAt: now, expiresAt })
    .onConflictDoNothing({ target: [generationLocks.userId, generationLocks.lockKey] })
    .returning({ userId: generationLocks.userId });

  if (inserted.length === 1) return { acquired: true };

  // Conflict — try to claim if stale.
  const overwrote = await db
    .update(generationLocks)
    .set({ acquiredAt: now, expiresAt })
    .where(
      and(
        eq(generationLocks.userId, userId),
        eq(generationLocks.lockKey, lockKey),
        lt(generationLocks.expiresAt, now),
      ),
    )
    .returning({ userId: generationLocks.userId });

  if (overwrote.length === 1) return { acquired: true };

  // Active lock held by someone else (likely another tab). Tell client to retry.
  const existing = await db
    .select({ expiresAt: generationLocks.expiresAt })
    .from(generationLocks)
    .where(and(eq(generationLocks.userId, userId), eq(generationLocks.lockKey, lockKey)))
    .limit(1);
  const remaining = existing[0]
    ? Math.max(0, existing[0].expiresAt.getTime() - now.getTime())
    : 5_000;
  return { acquired: false, tryAgainInMs: Math.min(remaining + 1000, 30_000) };
}

export async function releaseLock(userId: string, lockKey: string): Promise<void> {
  await db
    .delete(generationLocks)
    .where(and(eq(generationLocks.userId, userId), eq(generationLocks.lockKey, lockKey)));
}

/**
 * Best-effort wrapper. Acquires the lock, runs `fn`, releases on
 * completion (success or thrown). Returns the lock-busy signal directly
 * if we couldn't acquire.
 */
export async function withLock<T>(
  userId: string,
  lockKey: string,
  fn: () => Promise<T>,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<T | { acquired: false; tryAgainInMs: number }> {
  const lock = await acquireLock(userId, lockKey, ttlSec);
  if (!lock.acquired) return lock;
  try {
    return await fn();
  } finally {
    await releaseLock(userId, lockKey);
  }
}

void sql; // touched by Drizzle runtime; explicit to silence unused warnings
