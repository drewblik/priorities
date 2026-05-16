import { and, eq, isNull } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '@/db/client';
import { priorities } from '@/db/schema';
import { createEvent, getEventById, updateEvent } from '@/lib/events';
import { createMemoryEntry } from '@/lib/priority-memory';
import { updatePriority } from '@/lib/priorities';
import { upsertQuarterWeekFocus } from '@/lib/quarter-week-focus';
import { createTask, getTaskById, setTaskCompletion, updateTask } from '@/lib/tasks';
import { describeOverlap, findOverlap } from '@/lib/time-block-overlap';
import type { MasterChatResponse, ProposedAction } from '@/lib/master-chat-tools';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Whitelist for update_priority_field. Other fields rejected at validate
 *  time. Per Q6: arbitrary `{field, value}` from the model is unsafe; only
 *  user-content fields a chat can reasonably touch. */
const UPDATABLE_PRIORITY_FIELDS = new Set([
  'name',
  'smartGoal',
  'quarterlyStrategy',
  'weeklyStrategy',
  'dailyStrategy',
  'pinnedSummary',
  'minMinutesPerWeek',
  'maxMinutesPerWeek',
  'status',
]);

const VALID_PRIORITY_STATUSES = new Set(['active', 'paused', 'archived']);

export type ValidateContext = {
  userId: string;
  userTimezone: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; failed_action_index: number; reason: string };

export type ExecutionResult =
  | { ok: true; executed: Array<{ type: string; entity_id: string | null }> }
  | { ok: false; failed_action_index: number; reason: string; stage: 'validate' | 'execute' };

/**
 * Pre-validate every action in the preview before any writes. Catches
 * existence/applicability/conflict issues per TDD §664-678. If validation
 * passes, executePreview should generally succeed barring DB infra
 * failures.
 */
export async function validatePreview(
  response: MasterChatResponse,
  ctx: ValidateContext,
): Promise<ValidationResult> {
  for (let i = 0; i < response.proposed_actions.length; i++) {
    const action = response.proposed_actions[i];
    if (!action) {
      return { ok: false, failed_action_index: i, reason: 'action is undefined' };
    }
    const result = await validateAction(action, ctx);
    if (!result.ok) {
      return { ok: false, failed_action_index: i, reason: result.reason };
    }
  }
  return { ok: true };
}

async function validateAction(
  action: ProposedAction,
  ctx: ValidateContext,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (action.type) {
    case 'add_priority_memory': {
      const priority = await getPriorityRow(ctx.userId, action.priority_id);
      if (!priority) return { ok: false, reason: 'priority_not_found' };
      if (priority.status !== 'active') return { ok: false, reason: 'priority_not_active' };
      if (!action.body || action.body.trim().length === 0) {
        return { ok: false, reason: 'memory body is empty' };
      }
      if (action.body.length > 10000) return { ok: false, reason: 'memory body too long' };
      return { ok: true };
    }

    case 'create_task': {
      const priority = await getPriorityRow(ctx.userId, action.owner_priority_id);
      if (!priority) return { ok: false, reason: 'owner_priority_not_found' };
      if (!action.title || action.title.trim().length === 0) {
        return { ok: false, reason: 'title is empty' };
      }
      if (action.target_date && !DATE_ONLY.test(action.target_date)) {
        return { ok: false, reason: 'target_date must be YYYY-MM-DD' };
      }
      if (action.time_block_start || action.time_block_end) {
        if (!action.time_block_start || !action.time_block_end) {
          return { ok: false, reason: 'time_block_start and time_block_end must both be set' };
        }
        if (!DATETIME_LOCAL.test(action.time_block_start) || !DATETIME_LOCAL.test(action.time_block_end)) {
          return { ok: false, reason: 'time_block_* must be YYYY-MM-DDTHH:mm' };
        }
        const start = fromZonedTime(action.time_block_start, ctx.userTimezone);
        const end = fromZonedTime(action.time_block_end, ctx.userTimezone);
        if (end <= start) return { ok: false, reason: 'time_block_end must be after time_block_start' };
        const dateISO = action.time_block_start.slice(0, 10);
        const overlap = await findOverlap({
          userId: ctx.userId,
          dateISO,
          candidateStartUtc: start,
          candidateEndUtc: end,
          currentPriorityId: action.owner_priority_id,
          earlierPriorityIds: [], // master chat isn't queue-ordered; only feed/own overlaps check
          userTimezone: ctx.userTimezone,
        });
        if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };
      }
      return { ok: true };
    }

    case 'modify_task': {
      const task = await getTaskById(ctx.userId, action.task_id);
      if (!task) return { ok: false, reason: 'task_not_found' };
      const c = action.changes;
      if (c.title !== undefined && c.title.trim().length === 0) {
        return { ok: false, reason: 'title is empty' };
      }
      if (c.target_date !== undefined && !DATE_ONLY.test(c.target_date)) {
        return { ok: false, reason: 'target_date must be YYYY-MM-DD' };
      }
      if (c.status !== undefined && !['open', 'done', 'skipped'].includes(c.status)) {
        return { ok: false, reason: 'invalid status' };
      }
      if (c.time_block_start || c.time_block_end) {
        if (typeof c.time_block_start === 'string' && typeof c.time_block_end === 'string') {
          if (!DATETIME_LOCAL.test(c.time_block_start) || !DATETIME_LOCAL.test(c.time_block_end)) {
            return { ok: false, reason: 'time_block_* must be YYYY-MM-DDTHH:mm' };
          }
          const start = fromZonedTime(c.time_block_start, ctx.userTimezone);
          const end = fromZonedTime(c.time_block_end, ctx.userTimezone);
          if (end <= start) return { ok: false, reason: 'time_block_end must be after time_block_start' };
          const dateISO = c.time_block_start.slice(0, 10);
          const overlap = await findOverlap({
            userId: ctx.userId,
            dateISO,
            candidateStartUtc: start,
            candidateEndUtc: end,
            currentPriorityId: task.ownerPriorityId,
            earlierPriorityIds: [],
            userTimezone: ctx.userTimezone,
            ignoreTaskId: task.id,
          });
          if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };
        }
      }
      return { ok: true };
    }

    case 'complete_task': {
      const task = await getTaskById(ctx.userId, action.task_id);
      if (!task) return { ok: false, reason: 'task_not_found' };
      if (task.status !== 'open') return { ok: false, reason: `task already ${task.status}` };
      return { ok: true };
    }

    case 'create_event': {
      const priority = await getPriorityRow(ctx.userId, action.owner_priority_id);
      if (!priority) return { ok: false, reason: 'owner_priority_not_found' };
      if (!action.title || action.title.trim().length === 0) {
        return { ok: false, reason: 'title is empty' };
      }
      if (!DATETIME_LOCAL.test(action.start_time) || !DATETIME_LOCAL.test(action.end_time)) {
        return { ok: false, reason: 'start_time/end_time must be YYYY-MM-DDTHH:mm' };
      }
      const start = fromZonedTime(action.start_time, ctx.userTimezone);
      const end = fromZonedTime(action.end_time, ctx.userTimezone);
      if (end <= start) return { ok: false, reason: 'end_time must be after start_time' };
      const dateISO = action.start_time.slice(0, 10);
      const overlap = await findOverlap({
        userId: ctx.userId,
        dateISO,
        candidateStartUtc: start,
        candidateEndUtc: end,
        currentPriorityId: action.owner_priority_id,
        earlierPriorityIds: [],
        userTimezone: ctx.userTimezone,
      });
      if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };
      return { ok: true };
    }

    case 'modify_event': {
      const evt = await getEventById(ctx.userId, action.event_id);
      if (!evt) return { ok: false, reason: 'event_not_found' };
      const c = action.changes;
      if (c.title !== undefined && c.title.trim().length === 0) {
        return { ok: false, reason: 'title is empty' };
      }
      const newStartStr = c.start_time ?? null;
      const newEndStr = c.end_time ?? null;
      if (newStartStr || newEndStr) {
        const startStr = newStartStr ?? null;
        const endStr = newEndStr ?? null;
        if (startStr && !DATETIME_LOCAL.test(startStr)) {
          return { ok: false, reason: 'start_time must be YYYY-MM-DDTHH:mm' };
        }
        if (endStr && !DATETIME_LOCAL.test(endStr)) {
          return { ok: false, reason: 'end_time must be YYYY-MM-DDTHH:mm' };
        }
        const startUtc = startStr ? fromZonedTime(startStr, ctx.userTimezone) : evt.startTime;
        const endUtc = endStr ? fromZonedTime(endStr, ctx.userTimezone) : evt.endTime;
        if (endUtc <= startUtc) return { ok: false, reason: 'end_time must be after start_time' };
        const dateISO = (startStr ?? evt.startTime.toISOString()).slice(0, 10);
        const overlap = await findOverlap({
          userId: ctx.userId,
          dateISO,
          candidateStartUtc: startUtc,
          candidateEndUtc: endUtc,
          currentPriorityId: evt.ownerPriorityId,
          earlierPriorityIds: [],
          userTimezone: ctx.userTimezone,
          ignoreEventId: evt.id,
        });
        if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };
      }
      if (c.completion_status !== undefined && c.completion_status !== null) {
        if (!['attended', 'missed'].includes(c.completion_status)) {
          return { ok: false, reason: 'invalid completion_status' };
        }
      }
      return { ok: true };
    }

    case 'reschedule_quarter_week_focus': {
      // upsertQuarterWeekFocus does its own validation; we let it run at
      // execute time. Here just check the basics.
      if (!action.new_focus_label || action.new_focus_label.trim().length === 0) {
        return { ok: false, reason: 'new_focus_label is empty' };
      }
      if (action.new_focus_label.length > 200) {
        return { ok: false, reason: 'new_focus_label too long' };
      }
      return { ok: true };
    }

    case 'update_priority_field': {
      const priority = await getPriorityRow(ctx.userId, action.priority_id);
      if (!priority) return { ok: false, reason: 'priority_not_found' };
      if (!UPDATABLE_PRIORITY_FIELDS.has(action.field)) {
        return { ok: false, reason: 'field_not_updatable' };
      }
      // Type-check value per field.
      const v = action.value;
      switch (action.field) {
        case 'minMinutesPerWeek':
        case 'maxMinutesPerWeek':
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 10000) {
            return { ok: false, reason: `${action.field} must be a non-negative integer ≤ 10000` };
          }
          break;
        case 'status':
          if (typeof v !== 'string' || !VALID_PRIORITY_STATUSES.has(v)) {
            return { ok: false, reason: 'status must be active|paused|archived' };
          }
          break;
        default:
          if (v !== null && typeof v !== 'string') {
            return { ok: false, reason: `${action.field} must be a string or null` };
          }
          if (typeof v === 'string' && v.length > 5000) {
            return { ok: false, reason: `${action.field} value too long` };
          }
      }
      return { ok: true };
    }

    default: {
      // Exhaustiveness check.
      const _exhaustive: never = action;
      void _exhaustive;
      return { ok: false, reason: 'unknown_action_type' };
    }
  }
}

/**
 * Execute all actions sequentially after pre-validation passed. Mid-run
 * failures are very rare (would indicate a DB infra failure since
 * everything was validated). Returns the array of executed action refs on
 * success.
 */
export async function executePreview(
  response: MasterChatResponse,
  ctx: ValidateContext,
): Promise<ExecutionResult> {
  const validation = await validatePreview(response, ctx);
  if (!validation.ok) {
    return {
      ok: false,
      failed_action_index: validation.failed_action_index,
      reason: validation.reason,
      stage: 'validate',
    };
  }

  const executed: Array<{ type: string; entity_id: string | null }> = [];
  for (let i = 0; i < response.proposed_actions.length; i++) {
    const action = response.proposed_actions[i]!;
    const result = await executeAction(action, ctx);
    if (!result.ok) {
      return {
        ok: false,
        failed_action_index: i,
        reason: result.reason,
        stage: 'execute',
      };
    }
    executed.push({ type: action.type, entity_id: result.entity_id });
  }
  return { ok: true, executed };
}

async function executeAction(
  action: ProposedAction,
  ctx: ValidateContext,
): Promise<{ ok: true; entity_id: string | null } | { ok: false; reason: string }> {
  try {
    switch (action.type) {
      case 'add_priority_memory': {
        const row = await createMemoryEntry(ctx.userId, action.priority_id, {
          body: action.body,
          tags: action.tags ?? [],
          source: 'master_chat',
        });
        if (!row) return { ok: false, reason: 'memory_insert_failed' };
        return { ok: true, entity_id: row.id };
      }

      case 'create_task': {
        const timeBlockStart =
          action.time_block_start && DATETIME_LOCAL.test(action.time_block_start)
            ? fromZonedTime(action.time_block_start, ctx.userTimezone)
            : null;
        const timeBlockEnd =
          action.time_block_end && DATETIME_LOCAL.test(action.time_block_end)
            ? fromZonedTime(action.time_block_end, ctx.userTimezone)
            : null;
        const row = await createTask(ctx.userId, {
          ownerPriorityId: action.owner_priority_id,
          title: action.title,
          description: action.description ?? null,
          targetDate: action.target_date ?? null,
          timeBlockStart,
          timeBlockEnd,
          recurrence: null,
        });
        if (!row) return { ok: false, reason: 'task_insert_failed' };
        return { ok: true, entity_id: row.id };
      }

      case 'modify_task': {
        const c = action.changes;
        const patch: Parameters<typeof updateTask>[2] = {};
        if (c.title !== undefined) patch.title = c.title;
        if (c.description !== undefined) patch.description = c.description;
        if (c.target_date !== undefined) patch.targetDate = c.target_date;
        if (c.status !== undefined) patch.status = c.status;
        if (c.time_block_start !== undefined) {
          patch.timeBlockStart =
            c.time_block_start === null
              ? null
              : fromZonedTime(c.time_block_start, ctx.userTimezone);
        }
        if (c.time_block_end !== undefined) {
          patch.timeBlockEnd =
            c.time_block_end === null
              ? null
              : fromZonedTime(c.time_block_end, ctx.userTimezone);
        }
        const row = await updateTask(ctx.userId, action.task_id, patch);
        if (!row) return { ok: false, reason: 'task_update_failed' };
        return { ok: true, entity_id: row.id };
      }

      case 'complete_task': {
        const row = await setTaskCompletion(ctx.userId, action.task_id, 'done');
        if (!row) return { ok: false, reason: 'task_complete_failed' };
        return { ok: true, entity_id: row.id };
      }

      case 'create_event': {
        const row = await createEvent(ctx.userId, {
          ownerPriorityId: action.owner_priority_id,
          title: action.title,
          description: action.description ?? null,
          startTime: fromZonedTime(action.start_time, ctx.userTimezone),
          endTime: fromZonedTime(action.end_time, ctx.userTimezone),
          recurrence: null,
        });
        if (!row) return { ok: false, reason: 'event_insert_failed' };
        return { ok: true, entity_id: row.id };
      }

      case 'modify_event': {
        const c = action.changes;
        const patch: Parameters<typeof updateEvent>[2] = {};
        if (c.title !== undefined) patch.title = c.title;
        if (c.description !== undefined) patch.description = c.description;
        if (c.start_time !== undefined) {
          patch.startTime = fromZonedTime(c.start_time, ctx.userTimezone);
        }
        if (c.end_time !== undefined) {
          patch.endTime = fromZonedTime(c.end_time, ctx.userTimezone);
        }
        if (c.completion_status !== undefined) {
          patch.completionStatus = c.completion_status;
        }
        const row = await updateEvent(ctx.userId, action.event_id, patch);
        if (!row) return { ok: false, reason: 'event_update_failed' };
        return { ok: true, entity_id: row.id };
      }

      case 'reschedule_quarter_week_focus': {
        const result = await upsertQuarterWeekFocus(
          ctx.userId,
          action.quarter_id,
          action.priority_id,
          action.week_number,
          action.new_focus_label,
        );
        if ('error' in result) return { ok: false, reason: result.error };
        return { ok: true, entity_id: result.id };
      }

      case 'update_priority_field': {
        const patch: Record<string, unknown> = {};
        patch[action.field] = action.value;
        const row = await updatePriority(
          ctx.userId,
          action.priority_id,
          patch as Parameters<typeof updatePriority>[2],
        );
        if (!row) return { ok: false, reason: 'priority_update_failed' };
        return { ok: true, entity_id: row.id };
      }

      default: {
        const _exhaustive: never = action;
        void _exhaustive;
        return { ok: false, reason: 'unknown_action_type' };
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'execute_crashed';
    console.error(`master-chat-execute ${action.type} crashed:`, reason);
    return { ok: false, reason };
  }
}

async function getPriorityRow(userId: string, priorityId: string) {
  const rows = await db
    .select()
    .from(priorities)
    .where(
      and(
        eq(priorities.id, priorityId),
        eq(priorities.userId, userId),
        isNull(priorities.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
