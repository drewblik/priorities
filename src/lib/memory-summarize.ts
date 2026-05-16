import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities, priorityMemory, type PriorityMemory } from '@/db/schema';
import { getClientForUser } from '@/lib/anthropic-client';
import { acquireLock, releaseLock } from '@/lib/generation-locks';
import { buildMemorySummarizePrompt } from '@/lib/memory-summarize-prompt';

/** Subsystem 9 soft cap: keep the 10 newest entries live; everything
 *  older gets folded into pinned_summary then soft-deleted. */
const KEEP_RECENT = 10;
const SOFT_CAP = 50;
const SUMMARIZE_MAX_TOKENS = 2500;

export type SummarizeResult =
  | { ok: true; archived: number; newSummaryChars: number }
  | { ok: false; reason: string };

async function activeCount(priorityId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(priorityMemory)
    .where(and(eq(priorityMemory.priorityId, priorityId), isNull(priorityMemory.deletedAt)));
  return rows[0]?.c ?? 0;
}

/**
 * Compress a Priority's memory: fold entries beyond the 10 most recent into
 * pinned_summary via Haiku (Verbatim Prompt 8), then soft-delete those
 * entries. Lock key `priority_memory_summarize:<id>` (TTL via generation
 * lock) prevents concurrent runs. No-op if the caller doesn't own the
 * priority or there's nothing to archive.
 */
export async function summarizePriorityMemory(
  userId: string,
  priorityId: string,
): Promise<SummarizeResult> {
  const pri = await db
    .select({ id: priorities.id, name: priorities.name, pinned: priorities.pinnedSummary })
    .from(priorities)
    .where(
      and(
        eq(priorities.id, priorityId),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .limit(1);
  const priority = pri[0];
  if (!priority) return { ok: false, reason: 'priority_not_found' };

  const lock = await acquireLock(userId, `priority_memory_summarize:${priorityId}`);
  if (!lock.acquired) return { ok: false, reason: 'summarize_in_progress' };

  try {
    // Active entries, newest first; the ones BEYOND KEEP_RECENT are archived.
    const active = await db
      .select()
      .from(priorityMemory)
      .where(
        and(eq(priorityMemory.priorityId, priorityId), isNull(priorityMemory.deletedAt)),
      )
      .orderBy(desc(priorityMemory.createdAt));

    if (active.length <= KEEP_RECENT) {
      return { ok: false, reason: 'nothing_to_archive' };
    }

    const toArchive: PriorityMemory[] = active
      .slice(KEEP_RECENT)
      // Oldest first for the prompt (chronological integration reads better).
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let client;
    let model;
    try {
      const got = await getClientForUser(userId);
      client = got.client;
      model = got.model;
    } catch {
      return { ok: false, reason: 'anthropic_client_unavailable' };
    }

    const prompt = buildMemorySummarizePrompt({
      priorityName: priority.name,
      currentPinnedSummary: priority.pinned,
      archivedEntries: toArchive,
    });

    const completion = await client.messages.create({
      model,
      max_tokens: SUMMARIZE_MAX_TOKENS,
      system: prompt,
      messages: [
        { role: 'user', content: 'Produce the updated pinned summary now.' },
      ],
    });

    // Summarization cost is intentionally NOT metered against chat_sessions
    // (it's a rare maintenance op, not a user chat; no session row exists
    // here). Bounded + infrequent — documented as an acceptable v1 gap.

    const newSummary = completion.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!newSummary) return { ok: false, reason: 'empty_summary' };

    const now = new Date();
    await db
      .update(priorities)
      .set({ pinnedSummary: newSummary, updatedAt: now })
      .where(eq(priorities.id, priorityId));

    const ids = toArchive.map((e) => e.id);
    await db
      .update(priorityMemory)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(inArray(priorityMemory.id, ids), isNull(priorityMemory.deletedAt)));

    return { ok: true, archived: ids.length, newSummaryChars: newSummary.length };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'summarize_failed',
    };
  } finally {
    await releaseLock(userId, `priority_memory_summarize:${priorityId}`);
  }
}

/** Lazy trigger for planning-session start: summarize only if the Priority
 *  is over the soft cap. Safe to call unconditionally; cheap when under
 *  cap (one COUNT). Errors are swallowed so a summarization hiccup never
 *  blocks a planning session. */
export async function maybeSummarizeOnSessionStart(
  userId: string,
  priorityId: string,
): Promise<void> {
  try {
    const count = await activeCount(priorityId);
    if (count <= SOFT_CAP) return;
    await summarizePriorityMemory(userId, priorityId);
  } catch {
    // Non-fatal — planning continues with the (slightly large) memory.
  }
}

/** Archived (soft-deleted) memory for the "View archived memory" toggle in
 *  Priority Detail. Read-only; newest first. */
export async function getArchivedMemoryForPriority(
  userId: string,
  priorityId: string,
): Promise<PriorityMemory[]> {
  const rows = await db
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
        isNotNull(priorityMemory.deletedAt),
        isNull(priorities.deletedAt),
      ),
    )
    .orderBy(desc(priorityMemory.createdAt));
  return rows as PriorityMemory[];
}
