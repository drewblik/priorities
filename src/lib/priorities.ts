import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities, type Priority, type PriorityIcon } from '@/db/schema';
import { newId } from '@/lib/id';

export type PriorityStatus = 'active' | 'paused' | 'archived';
export type PriorityIconStyle = 'classic' | 'rounded' | 'serif' | 'script';

export type GetPrioritiesOpts = {
  includeArchived?: boolean;
};

export async function getPrioritiesForUser(
  userId: string,
  opts: GetPrioritiesOpts = {},
): Promise<Priority[]> {
  const rows = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.userId, userId), isNull(priorities.deletedAt)))
    .orderBy(asc(priorities.position));

  return opts.includeArchived ? rows : rows.filter((row) => row.status !== 'archived');
}

export async function getPriorityById(
  userId: string,
  id: string,
): Promise<Priority | null> {
  const rows = await db
    .select()
    .from(priorities)
    .where(
      and(
        eq(priorities.id, id),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type CreatePriorityInput = {
  name: string;
  icon: PriorityIcon;
  smartGoal?: string | null;
  quarterlyStrategy?: string | null;
  weeklyStrategy?: string | null;
  dailyStrategy?: string | null;
  minMinutesPerWeek: number;
  maxMinutesPerWeek: number;
  checkInCadence: string[];
};

export async function createPriority(
  userId: string,
  input: CreatePriorityInput,
): Promise<Priority> {
  const id = newId('pri');

  // Compute next position atomically with the insert.
  const [row] = await db
    .insert(priorities)
    .values({
      id,
      userId,
      name: input.name,
      icon: input.icon,
      smartGoal: input.smartGoal ?? null,
      quarterlyStrategy: input.quarterlyStrategy ?? null,
      weeklyStrategy: input.weeklyStrategy ?? null,
      dailyStrategy: input.dailyStrategy ?? null,
      minMinutesPerWeek: input.minMinutesPerWeek,
      maxMinutesPerWeek: input.maxMinutesPerWeek,
      checkInCadence: input.checkInCadence,
      position: sql`(SELECT COALESCE(MAX(position), 0) + 1 FROM priorities WHERE user_id = ${userId} AND deleted_at IS NULL)`,
    })
    .returning();

  if (!row) throw new Error('insert_failed');
  return row;
}

export type UpdatePriorityPatch = {
  name?: string;
  icon?: PriorityIcon;
  smartGoal?: string | null;
  quarterlyStrategy?: string | null;
  weeklyStrategy?: string | null;
  dailyStrategy?: string | null;
  minMinutesPerWeek?: number;
  maxMinutesPerWeek?: number;
  checkInCadence?: string[];
  status?: PriorityStatus;
};

export async function updatePriority(
  userId: string,
  id: string,
  patch: UpdatePriorityPatch,
): Promise<Priority | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) set[key] = value;
  }
  if (Object.keys(set).length === 1) {
    // Only updatedAt — nothing actually changed; just fetch and return.
    return getPriorityById(userId, id);
  }

  const [row] = await db
    .update(priorities)
    .set(set)
    .where(
      and(
        eq(priorities.id, id),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .returning();

  return row ?? null;
}

export async function softDeletePriority(userId: string, id: string): Promise<boolean> {
  // TODO M8: cascade soft-delete tasks, events, priority_memory, priority_files
  // per priorities-tdd.md:472-512 (selective: preserve past-completed tasks/events).
  const result = await db
    .update(priorities)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(priorities.id, id),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .returning({ id: priorities.id });
  return result.length > 0;
}

export async function reorderPriorities(
  userId: string,
  idsInOrder: string[],
): Promise<void> {
  if (idsInOrder.length === 0) return;

  // Single UPDATE with a CASE expression so this is one round-trip to Neon.
  const cases = idsInOrder.map((id, i) => sql`WHEN ${id} THEN ${i + 1}`);
  const caseExpr = sql`CASE ${priorities.id} ${sql.join(cases, sql` `)} END`;

  await db
    .update(priorities)
    .set({ position: caseExpr, updatedAt: new Date() })
    .where(
      and(
        eq(priorities.userId, userId),
        inArray(priorities.id, idsInOrder),
        isNull(priorities.deletedAt),
      ),
    );
}
