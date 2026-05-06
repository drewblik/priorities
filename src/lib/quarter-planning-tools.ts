import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { db } from '@/db/client';
import { newId } from '@/lib/id';
import { priorityMemory } from '@/db/schema';
import { upsertQuarterWeekFocus } from '@/lib/quarter-week-focus';

/**
 * Tool definitions for Quarter Planning chatbot. Names match Prompt 4
 * verbatim (`set_week_focus`, `add_memory`, `signal_done`).
 */
export const QUARTER_PLANNING_TOOLS: Tool[] = [
  {
    name: 'set_week_focus',
    description:
      "Set or update a week's focus label for the current Priority. Upserts by (quarter_id, priority_id, week_number).",
    input_schema: {
      type: 'object',
      properties: {
        week_number: {
          type: 'integer',
          description: 'Week number within the quarter, 1-indexed (1..N).',
          minimum: 1,
        },
        focus_label: {
          type: 'string',
          description:
            'Short string describing the focus for the week. E.g. "Base — 4 workouts/wk", "Recovery week", "Big race".',
          minLength: 1,
          maxLength: 200,
        },
      },
      required: ['week_number', 'focus_label'],
    },
  },
  {
    name: 'add_memory',
    description:
      'Capture context worth remembering for future planning sessions. Becomes a priority_memory entry tagged from this conversation.',
    input_schema: {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'The memory entry body, in markdown.',
          minLength: 1,
          maxLength: 10000,
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lowercase tags for filtering later (e.g., "training", "recovery").',
          maxItems: 10,
        },
      },
      required: ['body'],
    },
  },
  {
    name: 'signal_done',
    description:
      'Indicates that the chatbot has finished planning this Priority. The session will then advance to the next Priority in the queue.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

export type ToolExecutionContext = {
  userId: string;
  quarterId: string;
  priorityId: string;
};

export type ToolExecutionResult =
  | { ok: true; payload?: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Dispatcher for tool execution. Returns `{ ok, payload? }` for the model's
 * `tool_result` injection. On error, returns `{ ok: false, reason }` so the
 * model can self-correct rather than crashing the stream.
 */
export async function executeQuarterTool(
  name: string,
  input: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  try {
    if (name === 'set_week_focus') {
      const args = input as { week_number?: unknown; focus_label?: unknown };
      const wn = typeof args.week_number === 'number' ? args.week_number : Number(args.week_number);
      const lbl = typeof args.focus_label === 'string' ? args.focus_label : '';
      const result = await upsertQuarterWeekFocus(ctx.userId, ctx.quarterId, ctx.priorityId, wn, lbl);
      if ('error' in result) return { ok: false, reason: result.error };
      return {
        ok: true,
        payload: {
          week_number: result.weekNumber,
          focus_label: result.focusLabel,
        },
      };
    }
    if (name === 'add_memory') {
      const args = input as { body?: unknown; tags?: unknown };
      const body = typeof args.body === 'string' ? args.body.trim() : '';
      if (body.length === 0 || body.length > 10000) {
        return { ok: false, reason: 'body must be 1-10000 chars' };
      }
      const tags =
        Array.isArray(args.tags)
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
    console.error(`tool ${name} crashed:`, reason);
    return { ok: false, reason };
  }
}
