import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities, quarters, quarterWeekFocus, type QuarterWeekFocus } from '@/db/schema';
import { newId } from '@/lib/id';

/**
 * Read all quarter_week_focus rows for a quarter. Used by the Quarter Plan
 * page to render chips in QuarterCalendar.
 */
export async function getQuarterWeekFocusForQuarter(
  userId: string,
  quarterId: string,
): Promise<QuarterWeekFocus[]> {
  return db
    .select({
      id: quarterWeekFocus.id,
      quarterId: quarterWeekFocus.quarterId,
      priorityId: quarterWeekFocus.priorityId,
      weekNumber: quarterWeekFocus.weekNumber,
      focusLabel: quarterWeekFocus.focusLabel,
      createdAt: quarterWeekFocus.createdAt,
      updatedAt: quarterWeekFocus.updatedAt,
    })
    .from(quarterWeekFocus)
    .innerJoin(quarters, eq(quarters.id, quarterWeekFocus.quarterId))
    .where(and(eq(quarters.userId, userId), eq(quarterWeekFocus.quarterId, quarterId)));
}

/**
 * Upsert a quarter_week_focus row. Owner-checked: verifies the quarter
 * AND priority both belong to the user before writing. Returns the row
 * (created or updated).
 *
 * Validates week_number is within the quarter's bounds (rejects on out-of-
 * range so the chatbot sees a clear tool_result error and self-corrects).
 */
export async function upsertQuarterWeekFocus(
  userId: string,
  quarterId: string,
  priorityId: string,
  weekNumber: number,
  focusLabel: string,
): Promise<QuarterWeekFocus | { error: string }> {
  const ownership = await db
    .select({
      qStart: quarters.startDate,
      qEnd: quarters.endDate,
      priorityOk: sql<boolean>`(${priorities.userId} = ${userId})`,
    })
    .from(quarters)
    .innerJoin(priorities, eq(priorities.id, priorityId))
    .where(and(eq(quarters.id, quarterId), eq(quarters.userId, userId)))
    .limit(1);

  if (ownership.length === 0) return { error: 'quarter_or_priority_not_found' };
  const o = ownership[0];
  if (!o || !o.priorityOk) return { error: 'priority_not_owned' };

  // Quarter weeks: from start_date to end_date inclusive, ceil-divided by 7.
  const dayMs = 86_400_000;
  const start = new Date(`${o.qStart}T00:00:00Z`);
  const end = new Date(`${o.qEnd}T00:00:00Z`);
  const totalWeeks = Math.ceil((end.getTime() - start.getTime() + dayMs) / (7 * dayMs));
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > totalWeeks) {
    return { error: `week_number must be between 1 and ${totalWeeks}` };
  }
  if (typeof focusLabel !== 'string' || focusLabel.trim().length === 0 || focusLabel.length > 200) {
    return { error: 'focus_label must be 1-200 chars' };
  }

  const [row] = await db
    .insert(quarterWeekFocus)
    .values({
      id: newId('qwf'),
      quarterId,
      priorityId,
      weekNumber,
      focusLabel: focusLabel.trim(),
    })
    .onConflictDoUpdate({
      target: [quarterWeekFocus.quarterId, quarterWeekFocus.priorityId, quarterWeekFocus.weekNumber],
      set: {
        focusLabel: sql`excluded.focus_label`,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) return { error: 'qwf_upsert_failed' };
  return row;
}
