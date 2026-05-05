import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities } from '@/db/schema';

/**
 * Returns true iff the given priority exists, belongs to the user, and isn't
 * soft-deleted. Used by every per-priority sub-resource lib (memory, files,
 * tasks, events) to gate writes.
 */
export async function verifyPriorityOwnership(
  userId: string,
  priorityId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: priorities.id })
    .from(priorities)
    .where(
      and(
        eq(priorities.id, priorityId),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
