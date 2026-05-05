import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tasks, type Recurrence, type Task } from '@/db/schema';
import { newId } from '@/lib/id';
import { verifyPriorityOwnership } from '@/lib/priority-ownership';
import {
  type DisplayedTask,
  materializeVirtualTask,
  recurrenceIncludesDate,
} from '@/lib/recurrence';

export type CreateTaskInput = {
  ownerPriorityId: string;
  title: string;
  description?: string | null;
  targetDate?: string | null; // YYYY-MM-DD
  timeBlockStart?: Date | null;
  timeBlockEnd?: Date | null;
  recurrence?: Recurrence | null;
};

export type UpdateTaskPatch = {
  title?: string;
  description?: string | null;
  targetDate?: string | null;
  timeBlockStart?: Date | null;
  timeBlockEnd?: Date | null;
  recurrence?: Recurrence | null;
  status?: 'open' | 'done' | 'skipped';
};

export async function getTasksForPriority(
  userId: string,
  priorityId: string,
): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.ownerPriorityId, priorityId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(sql`${tasks.targetDate} NULLS LAST`), desc(tasks.createdAt));
}

export async function getTaskById(userId: string, taskId: string): Promise<Task | null> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns the user's full task list for a single calendar date, with
 * recurring-template instances expanded as virtual rows. See TDD §937-970.
 *
 * - Real rows include: one-offs with target_date = date, AND override rows
 *   (instance_of_task_id != null) with target_date = date.
 * - Virtual rows: for each recurring template (recurrence != null,
 *   instance_of_task_id = null) whose pattern includes `date`, append a
 *   materialized instance UNLESS an override already covers (template, date).
 */
export async function getTasksForDate(
  userId: string,
  dateISO: string,
): Promise<DisplayedTask[]> {
  // 1. Real tasks dated to this day.
  const realRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.targetDate, dateISO),
        isNull(tasks.deletedAt),
      ),
    );

  // 2. All recurring templates for this user.
  const templates = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.recurrence),
        isNull(tasks.instanceOfTaskId),
        isNull(tasks.deletedAt),
      ),
    );

  // Index of override coverage so we don't double-render.
  const coveredTemplates = new Set(
    realRows
      .filter((t) => t.instanceOfTaskId !== null)
      .map((t) => `${t.instanceOfTaskId}:${t.targetDate}`),
  );

  const virtuals: DisplayedTask[] = [];
  for (const template of templates) {
    if (!template.recurrence || !template.targetDate) continue;
    if (!recurrenceIncludesDate(template.recurrence, template.targetDate, dateISO)) continue;
    if (coveredTemplates.has(`${template.id}:${dateISO}`)) continue;
    virtuals.push(materializeVirtualTask(template, dateISO));
  }

  const reals: DisplayedTask[] = realRows.map((t) => ({ ...t, kind: 'real' }));
  return [...reals, ...virtuals];
}

export async function createTask(
  userId: string,
  input: CreateTaskInput,
): Promise<Task | null> {
  const ok = await verifyPriorityOwnership(userId, input.ownerPriorityId);
  if (!ok) return null;

  const [row] = await db
    .insert(tasks)
    .values({
      id: newId('task'),
      ownerPriorityId: input.ownerPriorityId,
      userId,
      title: input.title,
      description: input.description ?? null,
      targetDate: input.targetDate ?? null,
      timeBlockStart: input.timeBlockStart ?? null,
      timeBlockEnd: input.timeBlockEnd ?? null,
      recurrence: input.recurrence ?? null,
      status: 'open',
    })
    .returning();
  return row ?? null;
}

export async function updateTask(
  userId: string,
  taskId: string,
  patch: UpdateTaskPatch,
): Promise<Task | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) set[key] = value;
  }
  // If status moved to done, set completed_at; if back to open/skipped, clear it.
  if (patch.status === 'done') set.completedAt = new Date();
  if (patch.status === 'open' || patch.status === 'skipped') set.completedAt = null;

  if (Object.keys(set).length === 1) return getTaskById(userId, taskId);

  const [row] = await db
    .update(tasks)
    .set(set)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .returning();
  return row ?? null;
}

export async function setTaskCompletion(
  userId: string,
  taskId: string,
  status: 'open' | 'done' | 'skipped',
): Promise<Task | null> {
  return updateTask(userId, taskId, { status });
}

/**
 * Soft-delete a task. If it's a recurring template, also soft-delete every
 * override row pointing at it. Sequential statements (no transaction) per
 * the M6 cascade lesson.
 */
export async function softDeleteTask(userId: string, taskId: string): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(tasks)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id, recurrence: tasks.recurrence, instanceOf: tasks.instanceOfTaskId });
  if (updated.length === 0) return false;

  const head = updated[0];
  if (head && head.recurrence !== null && head.instanceOf === null) {
    // Was a template — cascade-soft-delete its overrides too.
    await db
      .update(tasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(tasks.instanceOfTaskId, taskId), isNull(tasks.deletedAt)));
  }
  return true;
}

/**
 * Materialize a virtual instance into a real override row. Used when the user
 * (or chatbot) interacts with a virtual instance for the first time — e.g.,
 * checking it off, skipping, or editing time block.
 *
 * NOT called from M8 UI directly (Priority Detail isn't date-scoped). Shipped
 * as the canonical helper for M9 Daily View.
 */
export async function materializeTaskOverride(
  userId: string,
  templateId: string,
  dateISO: string,
  patch: Omit<UpdateTaskPatch, 'recurrence'>,
): Promise<Task | null> {
  const template = await getTaskById(userId, templateId);
  if (!template || template.recurrence === null) return null;

  const [row] = await db
    .insert(tasks)
    .values({
      id: newId('task'),
      ownerPriorityId: template.ownerPriorityId,
      userId,
      title: patch.title ?? template.title,
      description: patch.description ?? template.description,
      targetDate: dateISO,
      timeBlockStart: patch.timeBlockStart ?? template.timeBlockStart,
      timeBlockEnd: patch.timeBlockEnd ?? template.timeBlockEnd,
      recurrence: null,
      instanceOfTaskId: templateId,
      status: patch.status ?? 'open',
      completedAt: patch.status === 'done' ? new Date() : null,
    })
    .returning();
  return row ?? null;
}

/**
 * Used by softDeletePriority to soft-delete all of a Priority's tasks except
 * those that are completed AND past-dated (TDD §472-512).
 *
 * "Past-dated and completed" survives:
 *   - status = 'done' OR status = 'skipped' AND completed_at IS NOT NULL
 *   - AND (target_date < CURRENT_DATE OR time_block_end < now())
 *
 * Everything else (open future tasks, open past tasks, templates, overrides)
 * gets soft-deleted. Override rows whose template is soft-deleted but which
 * themselves are past-completed are preserved as well.
 */
export async function cascadeSoftDeleteForPriority(
  ownerPriorityId: string,
  now: Date,
): Promise<void> {
  const todayISO = now.toISOString().slice(0, 10);
  await db.execute(sql`
    UPDATE tasks SET deleted_at = ${now}, updated_at = ${now}
    WHERE owner_priority_id = ${ownerPriorityId}
      AND deleted_at IS NULL
      AND NOT (
        completed_at IS NOT NULL
        AND (
          (target_date IS NOT NULL AND target_date < ${todayISO}::date)
          OR (time_block_end IS NOT NULL AND time_block_end < ${now})
        )
      )
  `);
}

