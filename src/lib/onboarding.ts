import { and, desc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatSessions, priorities as prioritiesTable, type ChatSession } from '@/db/schema';
import { newId } from '@/lib/id';
import { createMemoryEntry } from '@/lib/priority-memory';
import {
  createPriority,
  getPrioritiesForUser,
  softDeletePriority,
} from '@/lib/priorities';
import type { ProposedPriority } from '@/lib/onboarding-proposal-tools';

/**
 * First-run = the user has zero active priorities AND has never completed
 * (closed) an onboarding session. Used by the root redirect to send brand
 * new users to /onboarding instead of /today.
 */
export async function isFirstRun(userId: string): Promise<boolean> {
  const [priorities, closedOnboarding] = await Promise.all([
    getPrioritiesForUser(userId, { includeArchived: true }),
    db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.userId, userId),
          eq(chatSessions.sessionType, 'onboarding'),
          isNotNull(chatSessions.closedAt),
          isNull(chatSessions.deletedAt),
        ),
      )
      .limit(1),
  ]);
  return priorities.length === 0 && closedOnboarding.length === 0;
}

/**
 * One open onboarding session per user. `restart` closes any existing open
 * one first (Settings → Restart Onboarding Interview) so the prior
 * transcript stays in history with its closed_at set.
 */
export async function getOrCreateOnboardingSession(
  userId: string,
  opts: { restart?: boolean } = {},
): Promise<ChatSession> {
  const existing = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, 'onboarding'),
        isNull(chatSessions.contextRef),
        isNull(chatSessions.priorityId),
        isNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    )
    .orderBy(desc(chatSessions.openedAt))
    .limit(1);

  if (existing[0] && !opts.restart) return existing[0];

  if (existing[0] && opts.restart) {
    await db
      .update(chatSessions)
      .set({ closedAt: new Date() })
      .where(eq(chatSessions.id, existing[0].id));
  }

  const [created] = await db
    .insert(chatSessions)
    .values({
      id: newId('chs'),
      userId,
      sessionType: 'onboarding',
      contextRef: null,
      priorityId: null,
    })
    .returning();
  if (!created) throw new Error('onboarding_session_insert_failed');
  return created;
}

/** Mark the user's open onboarding session closed (interview complete or
 *  proposal accepted). Idempotent. */
export async function closeOnboardingSession(userId: string): Promise<void> {
  await db
    .update(chatSessions)
    .set({ closedAt: new Date() })
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.sessionType, 'onboarding'),
        isNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    );
}

/**
 * Subsystem 11 (minimal v1): true if the user added active Priorities
 * AFTER their most recent completed planning session — i.e. the new
 * Priorities weren't part of any plan yet. Drives a single dismissible
 * "re-plan to fold them in" banner (dismissal is client-side via
 * sessionStorage; no DB table per TDD §916's own v1 recommendation).
 */
export async function hasUnplannedNewPriorities(userId: string): Promise<boolean> {
  const lastClosed = await db
    .select({ openedAt: chatSessions.openedAt })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.userId, userId),
        inArray(chatSessions.sessionType, ['quarter', 'weekly', 'daily']),
        isNotNull(chatSessions.closedAt),
        isNull(chatSessions.deletedAt),
      ),
    )
    .orderBy(desc(chatSessions.openedAt))
    .limit(1);

  const cutoff = lastClosed[0]?.openedAt;
  if (!cutoff) return false; // no plan ever done → nothing to re-fold into

  const newer = await db
    .select({ id: prioritiesTable.id })
    .from(prioritiesTable)
    .where(
      and(
        eq(prioritiesTable.userId, userId),
        eq(prioritiesTable.status, 'active'),
        isNull(prioritiesTable.deletedAt),
        gt(prioritiesTable.createdAt, cutoff),
      ),
    )
    .limit(1);

  return newer.length > 0;
}

export type AcceptResult = {
  created: Array<{ id: string; name: string }>;
  failed: Array<{ name: string; reason: string }>;
};

/**
 * Create all proposed priorities + their starter memory entries. Sequential
 * statements (Neon HTTP has no branching transactions — same pattern used
 * throughout). `mode='replace'` cascade-soft-deletes existing active
 * priorities first (caller gates this on a typed REPLACE confirmation).
 */
export async function acceptCouncilProposal(
  userId: string,
  priorities: ProposedPriority[],
  mode: 'fresh' | 'add' | 'replace',
): Promise<AcceptResult> {
  if (mode === 'replace') {
    const existing = await getPrioritiesForUser(userId, { includeArchived: true });
    for (const p of existing) {
      await softDeletePriority(userId, p.id);
    }
  }

  const result: AcceptResult = { created: [], failed: [] };
  for (const p of priorities) {
    try {
      const row = await createPriority(userId, {
        name: p.name,
        icon: p.icon,
        smartGoal: p.smart_goal || null,
        quarterlyStrategy: p.quarterly_strategy || null,
        weeklyStrategy: p.weekly_strategy || null,
        dailyStrategy: p.daily_strategy || null,
        minMinutesPerWeek: p.min_minutes_per_week,
        maxMinutesPerWeek: p.max_minutes_per_week,
        checkInCadence: p.check_in_cadence,
      });
      result.created.push({ id: row.id, name: row.name });
      for (const m of p.starter_memory_entries) {
        await createMemoryEntry(userId, row.id, {
          body: m.body,
          tags: m.tags ?? [],
          source: 'onboarding',
        });
      }
    } catch (err) {
      result.failed.push({
        name: p.name,
        reason: err instanceof Error ? err.message : 'create failed',
      });
    }
  }
  return result;
}
