import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  priorities,
  priorityFiles,
  priorityMemory,
  type Priority,
  type PriorityIcon,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { cascadeSoftDeleteForPriority } from '@/lib/tasks';
import { cascadeSoftDeleteEventsForPriority } from '@/lib/events';

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

/**
 * Active priorities (not paused, not archived) whose check_in_cadence array
 * includes 'quarterly'. Ordered by position. Used by the Quarter Plan page
 * (M11) as the queue of priorities that get planned each quarter.
 */
export async function getQuarterlyPlanningQueue(userId: string): Promise<Priority[]> {
  const all = await getPrioritiesForUser(userId);
  return all.filter(
    (p) =>
      p.status === 'active' &&
      Array.isArray(p.checkInCadence) &&
      (p.checkInCadence as string[]).includes('quarterly'),
  );
}

/** Active priorities with `'weekly'` in `check_in_cadence`, ordered by
 *  position. Used by the Weekly Plan page (M13) as the queue. */
export async function getWeeklyPlanningQueue(userId: string): Promise<Priority[]> {
  const all = await getPrioritiesForUser(userId);
  return all.filter(
    (p) =>
      p.status === 'active' &&
      Array.isArray(p.checkInCadence) &&
      (p.checkInCadence as string[]).includes('weekly'),
  );
}

/** Active priorities with `'daily'` in `check_in_cadence`, ordered by
 *  position. Used by the Daily Plan page (M14) as the queue. */
export async function getDailyPlanningQueue(userId: string): Promise<Priority[]> {
  const all = await getPrioritiesForUser(userId);
  return all.filter(
    (p) =>
      p.status === 'active' &&
      Array.isArray(p.checkInCadence) &&
      (p.checkInCadence as string[]).includes('daily'),
  );
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
  pinnedSummary?: string | null;
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
  // Selective-cascade soft-delete per priorities-tdd.md:472-512.
  // - Memory + files: soft-deleted in full (M6).
  // - Tasks + events (M8): selectively preserved if completed AND past-dated;
  //   everything else (open future, open past, recurring templates, override
  //   rows) gets soft-deleted. Cascade helpers in tasks.ts / events.ts encode
  //   the SQL preservation predicate.
  //
  // Sequential statements rather than db.transaction() — the Neon HTTP driver's
  // transaction API can't branch on intermediate results (it batches all queries
  // upfront). The cascade is idempotent: if step 1 succeeds and step 2 fails,
  // the user can retry and the trailing updates will simply re-target zero rows.
  const now = new Date();

  const updated = await db
    .update(priorities)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(priorities.id, id),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .returning({ id: priorities.id });

  if (updated.length === 0) return false;

  await db
    .update(priorityMemory)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(priorityMemory.priorityId, id), isNull(priorityMemory.deletedAt)));

  await db
    .update(priorityFiles)
    .set({ deletedAt: now })
    .where(and(eq(priorityFiles.priorityId, id), isNull(priorityFiles.deletedAt)));

  await cascadeSoftDeleteForPriority(id, now);
  await cascadeSoftDeleteEventsForPriority(id, now);

  return true;
}

export async function reorderPriorities(
  userId: string,
  idsInOrder: string[],
): Promise<void> {
  if (idsInOrder.length === 0) return;

  // Sequential UPDATEs — one per priority. Slightly more round-trips than
  // the previous CASE-WHEN one-shot, but robust to Neon HTTP driver type
  // inference (the CASE expression unified to text, then Postgres refused
  // to assign text into the integer `position` column). At v1's personal
  // scale (≤ a couple dozen priorities) the latency cost is negligible.
  const now = new Date();
  for (let i = 0; i < idsInOrder.length; i++) {
    const id = idsInOrder[i];
    if (!id) continue;
    await db
      .update(priorities)
      .set({ position: i + 1, updatedAt: now })
      .where(
        and(
          eq(priorities.id, id),
          eq(priorities.userId, userId),
          isNull(priorities.deletedAt),
        ),
      );
  }
}
