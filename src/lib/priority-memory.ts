import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities, priorityMemory, type PriorityMemory } from '@/db/schema';
import { newId } from '@/lib/id';
import { verifyPriorityOwnership } from '@/lib/priority-ownership';

export async function getMemoryForPriority(
  userId: string,
  priorityId: string,
): Promise<PriorityMemory[]> {
  return db
    .select({
      id: priorityMemory.id,
      priorityId: priorityMemory.priorityId,
      body: priorityMemory.body,
      tags: priorityMemory.tags,
      source: priorityMemory.source,
      createdAt: priorityMemory.createdAt,
      updatedAt: priorityMemory.updatedAt,
      deletedAt: priorityMemory.deletedAt,
    })
    .from(priorityMemory)
    .innerJoin(priorities, eq(priorityMemory.priorityId, priorities.id))
    .where(
      and(
        eq(priorityMemory.priorityId, priorityId),
        eq(priorities.userId, userId),
        isNull(priorityMemory.deletedAt),
        isNull(priorities.deletedAt),
      ),
    )
    .orderBy(desc(priorityMemory.createdAt));
}

export type CreateMemoryInput = {
  body: string;
  tags: string[];
  /** Defaults to 'user'. M16+ master chat and M12+ planning chats override
   *  to 'master_chat' or 'chatbot' respectively. The DB enum allows
   *  user|chatbot|onboarding|master_chat per priorities-tdd.md:165. */
  source?: 'user' | 'chatbot' | 'master_chat' | 'onboarding';
};

export async function createMemoryEntry(
  userId: string,
  priorityId: string,
  input: CreateMemoryInput,
): Promise<PriorityMemory | null> {
  const ok = await verifyPriorityOwnership(userId, priorityId);
  if (!ok) return null;

  const [row] = await db
    .insert(priorityMemory)
    .values({
      id: newId('mem'),
      priorityId,
      body: input.body,
      tags: input.tags,
      source: input.source ?? 'user',
    })
    .returning();
  return row ?? null;
}

export type UpdateMemoryPatch = {
  body?: string;
  tags?: string[];
};

export async function updateMemoryEntry(
  userId: string,
  priorityId: string,
  memId: string,
  patch: UpdateMemoryPatch,
): Promise<PriorityMemory | null> {
  const ok = await verifyPriorityOwnership(userId, priorityId);
  if (!ok) return null;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.tags !== undefined) set.tags = patch.tags;

  const [row] = await db
    .update(priorityMemory)
    .set(set)
    .where(
      and(
        eq(priorityMemory.id, memId),
        eq(priorityMemory.priorityId, priorityId),
        isNull(priorityMemory.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function softDeleteMemoryEntry(
  userId: string,
  priorityId: string,
  memId: string,
): Promise<boolean> {
  const ok = await verifyPriorityOwnership(userId, priorityId);
  if (!ok) return false;

  const result = await db
    .update(priorityMemory)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(priorityMemory.id, memId),
        eq(priorityMemory.priorityId, priorityId),
        isNull(priorityMemory.deletedAt),
      ),
    )
    .returning({ id: priorityMemory.id });
  return result.length > 0;
}
