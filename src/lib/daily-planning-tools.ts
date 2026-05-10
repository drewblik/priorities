import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '@/db/client';
import { priorityMemory } from '@/db/schema';
import { newId } from '@/lib/id';
import { createEvent, getEventById, softDeleteEvent, updateEvent } from '@/lib/events';
import { getTaskById, updateTask } from '@/lib/tasks';
import { describeOverlap, findOverlap } from '@/lib/time-block-overlap';

/**
 * Tool definitions for Daily Planning chatbot. Names + signatures match
 * Verbatim Prompt 6 (priorities-tdd.md:1307-1311). Same shape as M13's
 * weekly tools, but the validation set is daily-scoped (target day + overlap
 * checks against earlier-priority blocks and calendar feed events).
 */
export const DAILY_PLANNING_TOOLS: Tool[] = [
  {
    name: 'set_task_time_block',
    description:
      'Assign a time block to one of the current Priority\'s tasks for tomorrow. Validates the task belongs to the current Priority and is for tomorrow, then checks for overlap with earlier-priority blocks or calendar feed events.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task id (from the prompt context).' },
        start_time: {
          type: 'string',
          description: 'YYYY-MM-DDTHH:mm in user TZ. Must fall on tomorrow.',
        },
        end_time: {
          type: 'string',
          description: 'YYYY-MM-DDTHH:mm in user TZ. Must be after start_time.',
        },
      },
      required: ['task_id', 'start_time', 'end_time'],
    },
  },
  {
    name: 'create_event',
    description:
      'Schedule a NEW time-bound Event on tomorrow for the current Priority. Use only when the user wants something not already in the task list (e.g. a meeting, an explicit appointment). Same overlap checks apply.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        start_time: {
          type: 'string',
          description: 'YYYY-MM-DDTHH:mm in user TZ. Must fall on tomorrow.',
        },
        end_time: {
          type: 'string',
          description: 'YYYY-MM-DDTHH:mm in user TZ. Must be after start_time.',
        },
        description: { type: 'string', maxLength: 2000 },
      },
      required: ['title', 'start_time', 'end_time'],
    },
  },
  {
    name: 'update_event',
    description:
      "Modify a previously-created event's time, title, or description. Use this when the user wants to revise an event you already scheduled (e.g. shorten 6-9 PM to 6-7 PM) — DO NOT call create_event for revisions, that creates a duplicate. The event must belong to the current Priority. Overlap checks apply to the new range, ignoring this event's own old slot. Pass only the fields you want to change.",
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'The event id from a prior create_event tool result.' },
        start_time: {
          type: 'string',
          description: 'Optional new start: YYYY-MM-DDTHH:mm in user TZ on the planning day.',
        },
        end_time: {
          type: 'string',
          description: 'Optional new end: YYYY-MM-DDTHH:mm in user TZ. Must be after start_time.',
        },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 2000 },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_event',
    description:
      'Soft-delete an event the current Priority created earlier. Use sparingly — only when the user explicitly wants to remove it entirely. The event must belong to the current Priority.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'add_memory',
    description:
      'Capture context worth remembering for future planning sessions. Becomes a priority_memory entry tagged from this conversation.',
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string', minLength: 1, maxLength: 10000 },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      },
      required: ['body'],
    },
  },
  {
    name: 'signal_done',
    description: 'Indicates planning for this Priority is finished. Session advances to next.',
    input_schema: { type: 'object', properties: {} },
  },
];

export type DailyToolContext = {
  userId: string;
  priorityId: string;
  earlierPriorityIds: string[];
  userTimezone: string;
  dateISO: string;
};

export type DailyToolResult =
  | { ok: true; payload?: Record<string, unknown> }
  | { ok: false; reason: string };

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export async function executeDailyTool(
  name: string,
  input: unknown,
  ctx: DailyToolContext,
): Promise<DailyToolResult> {
  try {
    if (name === 'set_task_time_block') {
      const args = input as { task_id?: unknown; start_time?: unknown; end_time?: unknown };
      const taskId = typeof args.task_id === 'string' ? args.task_id.trim() : '';
      if (!taskId) return { ok: false, reason: 'task_id required' };
      const startStr = typeof args.start_time === 'string' ? args.start_time.trim() : '';
      const endStr = typeof args.end_time === 'string' ? args.end_time.trim() : '';
      if (!DATETIME_LOCAL.test(startStr) || !DATETIME_LOCAL.test(endStr)) {
        return { ok: false, reason: 'start_time + end_time must be YYYY-MM-DDTHH:mm' };
      }
      if (startStr.slice(0, 10) !== ctx.dateISO || endStr.slice(0, 10) !== ctx.dateISO) {
        return { ok: false, reason: `times must fall on ${ctx.dateISO}` };
      }
      const startUtc = fromZonedTime(startStr, ctx.userTimezone);
      const endUtc = fromZonedTime(endStr, ctx.userTimezone);
      if (endUtc <= startUtc) return { ok: false, reason: 'end_time must be after start_time' };

      // Verify ownership: the task must belong to the current priority.
      const existing = await getTaskById(ctx.userId, taskId);
      if (!existing) return { ok: false, reason: 'task_not_found' };
      if (existing.ownerPriorityId !== ctx.priorityId) {
        return { ok: false, reason: 'task does not belong to the current Priority' };
      }

      // Conflict check.
      const overlap = await findOverlap({
        userId: ctx.userId,
        dateISO: ctx.dateISO,
        candidateStartUtc: startUtc,
        candidateEndUtc: endUtc,
        currentPriorityId: ctx.priorityId,
        earlierPriorityIds: ctx.earlierPriorityIds,
        userTimezone: ctx.userTimezone,
        ignoreTaskId: taskId, // re-blocking the same task is fine
      });
      if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };

      const updated = await updateTask(ctx.userId, taskId, {
        timeBlockStart: startUtc,
        timeBlockEnd: endUtc,
      });
      if (!updated) return { ok: false, reason: 'update_failed' };
      return {
        ok: true,
        payload: { task_id: updated.id, title: updated.title, start: startStr, end: endStr },
      };
    }

    if (name === 'create_event') {
      const args = input as {
        title?: unknown;
        start_time?: unknown;
        end_time?: unknown;
        description?: unknown;
      };
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (title.length === 0 || title.length > 200) return { ok: false, reason: 'title must be 1-200 chars' };
      const startStr = typeof args.start_time === 'string' ? args.start_time.trim() : '';
      const endStr = typeof args.end_time === 'string' ? args.end_time.trim() : '';
      if (!DATETIME_LOCAL.test(startStr) || !DATETIME_LOCAL.test(endStr)) {
        return { ok: false, reason: 'start_time + end_time must be YYYY-MM-DDTHH:mm' };
      }
      if (startStr.slice(0, 10) !== ctx.dateISO || endStr.slice(0, 10) !== ctx.dateISO) {
        return { ok: false, reason: `times must fall on ${ctx.dateISO}` };
      }
      const startUtc = fromZonedTime(startStr, ctx.userTimezone);
      const endUtc = fromZonedTime(endStr, ctx.userTimezone);
      if (endUtc <= startUtc) return { ok: false, reason: 'end_time must be after start_time' };
      const description =
        typeof args.description === 'string' && args.description.trim().length > 0
          ? args.description.trim()
          : null;

      const overlap = await findOverlap({
        userId: ctx.userId,
        dateISO: ctx.dateISO,
        candidateStartUtc: startUtc,
        candidateEndUtc: endUtc,
        currentPriorityId: ctx.priorityId,
        earlierPriorityIds: ctx.earlierPriorityIds,
        userTimezone: ctx.userTimezone,
      });
      if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };

      const created = await createEvent(ctx.userId, {
        ownerPriorityId: ctx.priorityId,
        title,
        description,
        startTime: startUtc,
        endTime: endUtc,
        recurrence: null,
      });
      if (!created) return { ok: false, reason: 'priority_not_owned_or_create_failed' };
      return {
        ok: true,
        payload: { event_id: created.id, title: created.title, start: startStr, end: endStr },
      };
    }

    if (name === 'update_event') {
      const args = input as {
        event_id?: unknown;
        start_time?: unknown;
        end_time?: unknown;
        title?: unknown;
        description?: unknown;
      };
      const eventId = typeof args.event_id === 'string' ? args.event_id.trim() : '';
      if (!eventId) return { ok: false, reason: 'event_id required' };

      const existing = await getEventById(ctx.userId, eventId);
      if (!existing) return { ok: false, reason: 'event_not_found' };
      if (existing.ownerPriorityId !== ctx.priorityId) {
        return { ok: false, reason: 'event does not belong to the current Priority' };
      }

      const patch: {
        startTime?: Date;
        endTime?: Date;
        title?: string;
        description?: string | null;
      } = {};

      let newStartUtc = existing.startTime;
      let newEndUtc = existing.endTime;

      if (args.start_time !== undefined && args.start_time !== null) {
        const s = typeof args.start_time === 'string' ? args.start_time.trim() : '';
        if (!DATETIME_LOCAL.test(s)) {
          return { ok: false, reason: 'start_time must be YYYY-MM-DDTHH:mm' };
        }
        if (s.slice(0, 10) !== ctx.dateISO) {
          return { ok: false, reason: `times must fall on ${ctx.dateISO}` };
        }
        newStartUtc = fromZonedTime(s, ctx.userTimezone);
        patch.startTime = newStartUtc;
      }
      if (args.end_time !== undefined && args.end_time !== null) {
        const e = typeof args.end_time === 'string' ? args.end_time.trim() : '';
        if (!DATETIME_LOCAL.test(e)) {
          return { ok: false, reason: 'end_time must be YYYY-MM-DDTHH:mm' };
        }
        if (e.slice(0, 10) !== ctx.dateISO) {
          return { ok: false, reason: `times must fall on ${ctx.dateISO}` };
        }
        newEndUtc = fromZonedTime(e, ctx.userTimezone);
        patch.endTime = newEndUtc;
      }
      if (newEndUtc <= newStartUtc) {
        return { ok: false, reason: 'end_time must be after start_time' };
      }

      if (args.title !== undefined && args.title !== null) {
        const t = typeof args.title === 'string' ? args.title.trim() : '';
        if (t.length === 0 || t.length > 200) {
          return { ok: false, reason: 'title must be 1-200 chars' };
        }
        patch.title = t;
      }
      if (args.description !== undefined) {
        if (args.description === null) {
          patch.description = null;
        } else {
          const d = typeof args.description === 'string' ? args.description.trim() : '';
          if (d.length > 2000) {
            return { ok: false, reason: 'description must be 0-2000 chars' };
          }
          patch.description = d.length > 0 ? d : null;
        }
      }

      // If we changed the time, re-check overlap (ignoring this event itself).
      if (patch.startTime !== undefined || patch.endTime !== undefined) {
        const overlap = await findOverlap({
          userId: ctx.userId,
          dateISO: ctx.dateISO,
          candidateStartUtc: newStartUtc,
          candidateEndUtc: newEndUtc,
          currentPriorityId: ctx.priorityId,
          earlierPriorityIds: ctx.earlierPriorityIds,
          userTimezone: ctx.userTimezone,
          ignoreEventId: eventId,
        });
        if (overlap) return { ok: false, reason: describeOverlap(overlap, ctx.userTimezone) };
      }

      if (Object.keys(patch).length === 0) {
        return { ok: false, reason: 'no fields to update' };
      }

      const updated = await updateEvent(ctx.userId, eventId, patch);
      if (!updated) return { ok: false, reason: 'update_failed' };
      return { ok: true, payload: { event_id: updated.id, title: updated.title } };
    }

    if (name === 'delete_event') {
      const args = input as { event_id?: unknown };
      const eventId = typeof args.event_id === 'string' ? args.event_id.trim() : '';
      if (!eventId) return { ok: false, reason: 'event_id required' };

      const existing = await getEventById(ctx.userId, eventId);
      if (!existing) return { ok: false, reason: 'event_not_found' };
      if (existing.ownerPriorityId !== ctx.priorityId) {
        return { ok: false, reason: 'event does not belong to the current Priority' };
      }

      const ok = await softDeleteEvent(ctx.userId, eventId);
      if (!ok) return { ok: false, reason: 'delete_failed' };
      return { ok: true, payload: { event_id: eventId, deleted: true } };
    }

    if (name === 'add_memory') {
      const args = input as { body?: unknown; tags?: unknown };
      const body = typeof args.body === 'string' ? args.body.trim() : '';
      if (body.length === 0 || body.length > 10000) {
        return { ok: false, reason: 'body must be 1-10000 chars' };
      }
      const tags = Array.isArray(args.tags)
        ? args.tags
            .filter((t): t is string => typeof t === 'string' && t.length > 0)
            .map((t) => t.trim().toLowerCase())
            .slice(0, 10)
        : [];
      const [row] = await db
        .insert(priorityMemory)
        .values({
          id: newId('mem'),
          priorityId: ctx.priorityId,
          body,
          tags,
          source: 'chatbot',
        })
        .returning();
      return { ok: true, payload: { memory_id: row?.id ?? null } };
    }

    if (name === 'signal_done') {
      return { ok: true, payload: { signaled: true } };
    }

    return { ok: false, reason: `unknown tool: ${name}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'tool execution crashed';
    console.error(`daily tool ${name} crashed:`, reason);
    return { ok: false, reason };
  }
}
