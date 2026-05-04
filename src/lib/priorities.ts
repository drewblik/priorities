import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities, type Priority } from '@/db/schema';

export async function getPrioritiesForUser(userId: string): Promise<Priority[]> {
  return db
    .select()
    .from(priorities)
    .where(and(eq(priorities.userId, userId), isNull(priorities.deletedAt)))
    .orderBy(asc(priorities.position));
}
