import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '@/db/client';
import { priorityMemory } from '@/db/schema';
import { newId } from '@/lib/id';
import { createEvent } from '@/lib/events';
import { RecurrenceSchema } from '@/lib/priorities-validation';
import { createTask } from '@/lib/tasks';

/**
 * Tool definitions for Weekly Planning chatbot. Names + signatures match
 * Verbatim Prompt 5 (priorities-tdd.md:1276-1279).
 *
 * No update/delete tools at v1; modifications happen via Daily View
 * checkboxes (M9) or M15 re-planning.
 */
export const WEEKLY_PLANNING_TOOLS: Tool[] = [
  {
    name: 'create_task',
    description:
      "Assign a Task to a specific day for the current Priority. No time block yet — that's a Daily Plan step. Optional recurrence creates a recurring template instead of a one-off.",
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the task.',
          minLength: 1,
          maxLength: 200,
        },
        target_date: {
          type: 'string',
          description: 'YYYY-MM-DD. Must be within the current week range.',
        },
        description: {
          type: 'string',
          description: 'Optional longer description.',
          maxLength: 2000,
        },
        recurrence: {
          type: 'object',
          description:
            'Optional recurrence pattern. Omit for a one-off task. type=daily|weekly|monthly; interval >= 1; for weekly add `byday` array of MO/TU/WE/TH/FR/SA/SU; for monthly add `bymonthday` 1-31; optional `until` ISO date.',
          properties: {
            type: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            interval: { type: 'integer', minimum: 1 },
            byday: { type: 'array', items: { type: 'string' } },
            bymonthday: { type: 'integer', minimum: 1, maximum: 31 },
            until: { type: 'string' },
          },
        },
      },
      required: ['title', 'target_date'],
    },
  },
  {
    name: 'create_event',
    description:
      'Schedule a time-bound Event for the current Priority. start_time + end_time are datetime-local strings (YYYY-MM-DDTHH:mm) interpreted in the user\'s timezone.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        start_time: {
          type: 'string',
          description: 'YYYY-MM-DDTHH:mm in user TZ. Must be within the current week range.',
        },
        end_time: {
          type: 'string',
          description: 'YYYY-MM-DDTHH:mm in user TZ. Must be after start_time.',
        },
        description: { type: 'string', maxLength: 2000 },
        recurrence: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            interval: { type: 'integer', minimum: 1 },
            byday: { type: 'array', items: { type: 'string' } },
            bymonthday: { type: 'integer', minimum: 1, maximum: 31 },
            until: { type: 'string' },
          },
        },
      },
      required: ['title', 'start_time', 'end_time'],
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

export type WeeklyToolContext = {
  userId: string;
  priorityId: string;
  userTimezone: string;
  weekStartISO: string;
  weekEndISO: string;
};

export type WeeklyToolResult =
  | { ok: true; payload?: Record<string, unknown> }
  | { ok: false; reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export async function executeWeeklyTool(
  name: string,
  input: unknown,
  ctx: WeeklyToolContext,
): Promise<WeeklyToolResult> {
  try {
    if (name === 'create_task') {
      const args = input as {
        title?: unknown;
        target_date?: unknown;
        description?: unknown;
        recurrence?: unknown;
      };
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (title.length === 0 || title.length > 200) return { ok: false, reason: 'title must be 1-200 chars' };
      const targetDate = typeof args.target_date === 'string' ? args.target_date.trim() : '';
      if (!ISO_DATE.test(targetDate)) {
        return { ok: false, reason: 'target_date must be YYYY-MM-DD' };
      }
      if (targetDate < ctx.weekStartISO || targetDate > ctx.weekEndISO) {
        return {
          ok: false,
          reason: `target_date must be within the current week (${ctx.weekStartISO} to ${ctx.weekEndISO})`,
        };
      }
      const description =
        typeof args.description === 'string' && args.description.trim().length > 0
          ? args.description.trim()
          : null;
      let recurrence = null;
      if (args.recurrence != null) {
        const parsed = RecurrenceSchema.safeParse(args.recurrence);
        if (!parsed.success) return { ok: false, reason: 'invalid recurrence shape' };
        recurrence = parsed.data;
      }
      const created = await createTask(ctx.userId, {
        ownerPriorityId: ctx.priorityId,
        title,
        description,
        targetDate,
        timeBlockStart: null,
        timeBlockEnd: null,
        recurrence,
      });
      if (!created) return { ok: false, reason: 'priority_not_owned_or_create_failed' };
      return { ok: true, payload: { task_id: created.id, title: created.title, target_date: created.targetDate } };
    }

    if (name === 'create_event') {
      const args = input as {
        title?: unknown;
        start_time?: unknown;
        end_time?: unknown;
        description?: unknown;
        recurrence?: unknown;
      };
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (title.length === 0 || title.length > 200) return { ok: false, reason: 'title must be 1-200 chars' };
      const startStr = typeof args.start_time === 'string' ? args.start_time.trim() : '';
      const endStr = typeof args.end_time === 'string' ? args.end_time.trim() : '';
      if (!DATETIME_LOCAL.test(startStr) || !DATETIME_LOCAL.test(endStr)) {
        return { ok: false, reason: 'start_time + end_time must be YYYY-MM-DDTHH:mm' };
      }
      const startUtc = fromZonedTime(startStr, ctx.userTimezone);
      const endUtc = fromZonedTime(endStr, ctx.userTimezone);
      if (endUtc <= startUtc) return { ok: false, reason: 'end_time must be after start_time' };
      const startDate = startStr.slice(0, 10);
      if (startDate < ctx.weekStartISO || startDate > ctx.weekEndISO) {
        return {
          ok: false,
          reason: `start_time must be within the current week (${ctx.weekStartISO} to ${ctx.weekEndISO})`,
        };
      }
      const description =
        typeof args.description === 'string' && args.description.trim().length > 0
          ? args.description.trim()
          : null;
      let recurrence = null;
      if (args.recurrence != null) {
        const parsed = RecurrenceSchema.safeParse(args.recurrence);
        if (!parsed.success) return { ok: false, reason: 'invalid recurrence shape' };
        recurrence = parsed.data;
      }
      const created = await createEvent(ctx.userId, {
        ownerPriorityId: ctx.priorityId,
        title,
        description,
        startTime: startUtc,
        endTime: endUtc,
        recurrence,
      });
      if (!created) return { ok: false, reason: 'priority_not_owned_or_create_failed' };
      return {
        ok: true,
        payload: {
          event_id: created.id,
          title: created.title,
          start: startStr,
          end: endStr,
        },
      };
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
    console.error(`weekly tool ${name} crashed:`, reason);
    return { ok: false, reason };
  }
}
