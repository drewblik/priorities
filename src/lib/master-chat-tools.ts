import type { Tool } from '@anthropic-ai/sdk/resources/messages';

/**
 * MasterChatResponse + ProposedAction shapes per TDD §636-654. The model
 * MUST emit exactly one tool call to `submit_preview` whose input matches
 * the schema below. M16 uses Anthropic's tool-forcing pattern
 * (`tool_choice: { type: 'tool', name: 'submit_preview' }`) so the model
 * can't deliver free-form text.
 */
export type AffectedPriority = {
  id: string;
  reasoning: string;
};

export type ProposedAction =
  | {
      type: 'add_priority_memory';
      priority_id: string;
      body: string;
      tags?: string[];
    }
  | {
      type: 'create_task';
      owner_priority_id: string;
      title: string;
      target_date?: string;
      time_block_start?: string;
      time_block_end?: string;
      description?: string;
    }
  | {
      type: 'modify_task';
      task_id: string;
      changes: {
        title?: string;
        description?: string;
        target_date?: string;
        time_block_start?: string | null;
        time_block_end?: string | null;
        status?: 'open' | 'done' | 'skipped';
      };
    }
  | {
      type: 'complete_task';
      task_id: string;
    }
  | {
      type: 'create_event';
      owner_priority_id: string;
      title: string;
      start_time: string;
      end_time: string;
      description?: string;
    }
  | {
      type: 'modify_event';
      event_id: string;
      changes: {
        title?: string;
        description?: string;
        start_time?: string;
        end_time?: string;
        completion_status?: 'attended' | 'missed' | null;
      };
    }
  | {
      type: 'reschedule_quarter_week_focus';
      quarter_id: string;
      priority_id: string;
      week_number: number;
      new_focus_label: string;
    }
  | {
      type: 'update_priority_field';
      priority_id: string;
      field: string;
      value: unknown;
    };

export type MasterChatResponse = {
  understanding: string;
  affected_priorities: AffectedPriority[];
  proposed_actions: ProposedAction[];
  preview_summary: string;
  needs_clarification?: string;
};

/**
 * Single tool the master chat is forced to invoke. The input_schema is the
 * MasterChatResponse shape. Action types are encoded as a discriminated
 * union in the JSON schema using `oneOf`.
 */
export const SUBMIT_PREVIEW_TOOL: Tool = {
  name: 'submit_preview',
  description:
    'Submit your structured response. ALWAYS call this exactly once per turn — the user only sees what you pass here.',
  input_schema: {
    type: 'object',
    properties: {
      understanding: {
        type: 'string',
        description: 'Free-form: what you think the user is saying.',
      },
      affected_priorities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            reasoning: { type: 'string' },
          },
          required: ['id', 'reasoning'],
        },
      },
      proposed_actions: {
        type: 'array',
        description:
          'Concrete actions to preview. Each item is one of the typed shapes below. Use empty array if needs_clarification is set.',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                type: { const: 'add_priority_memory' },
                priority_id: { type: 'string' },
                body: { type: 'string', minLength: 1, maxLength: 10000 },
                tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              },
              required: ['type', 'priority_id', 'body'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'create_task' },
                owner_priority_id: { type: 'string' },
                title: { type: 'string', minLength: 1, maxLength: 200 },
                target_date: { type: 'string', description: 'YYYY-MM-DD' },
                time_block_start: { type: 'string', description: 'YYYY-MM-DDTHH:mm in user TZ' },
                time_block_end: { type: 'string', description: 'YYYY-MM-DDTHH:mm in user TZ' },
                description: { type: 'string', maxLength: 2000 },
              },
              required: ['type', 'owner_priority_id', 'title'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'modify_task' },
                task_id: { type: 'string' },
                changes: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', maxLength: 200 },
                    description: { type: 'string', maxLength: 2000 },
                    target_date: { type: 'string' },
                    time_block_start: { type: ['string', 'null'] },
                    time_block_end: { type: ['string', 'null'] },
                    status: { type: 'string', enum: ['open', 'done', 'skipped'] },
                  },
                },
              },
              required: ['type', 'task_id', 'changes'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'complete_task' },
                task_id: { type: 'string' },
              },
              required: ['type', 'task_id'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'create_event' },
                owner_priority_id: { type: 'string' },
                title: { type: 'string', minLength: 1, maxLength: 200 },
                start_time: { type: 'string' },
                end_time: { type: 'string' },
                description: { type: 'string', maxLength: 2000 },
              },
              required: ['type', 'owner_priority_id', 'title', 'start_time', 'end_time'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'modify_event' },
                event_id: { type: 'string' },
                changes: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', maxLength: 200 },
                    description: { type: 'string', maxLength: 2000 },
                    start_time: { type: 'string' },
                    end_time: { type: 'string' },
                    completion_status: {
                      type: ['string', 'null'],
                      enum: ['attended', 'missed', null],
                    },
                  },
                },
              },
              required: ['type', 'event_id', 'changes'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'reschedule_quarter_week_focus' },
                quarter_id: { type: 'string' },
                priority_id: { type: 'string' },
                week_number: { type: 'integer', minimum: 1, maximum: 13 },
                new_focus_label: { type: 'string', minLength: 1, maxLength: 200 },
              },
              required: ['type', 'quarter_id', 'priority_id', 'week_number', 'new_focus_label'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'update_priority_field' },
                priority_id: { type: 'string' },
                field: { type: 'string' },
                value: {},
              },
              required: ['type', 'priority_id', 'field', 'value'],
            },
          ],
        },
      },
      preview_summary: {
        type: 'string',
        description: 'Concrete human-readable summary of what will happen if confirmed.',
      },
      needs_clarification: {
        type: 'string',
        description:
          'Set ONLY when you genuinely can\'t decide what to do. If set, leave proposed_actions empty.',
      },
    },
    required: ['understanding', 'affected_priorities', 'proposed_actions', 'preview_summary'],
  },
};

/** Validate a tool_use.input against the MasterChatResponse shape. Light
 *  validation — Anthropic's tool-forcing already enforces the schema, but
 *  this catches any drift. Returns the typed response on success, or an
 *  error reason on failure. */
export function parseMasterChatResponse(
  input: unknown,
): { ok: true; response: MasterChatResponse } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'tool input is not an object' };
  }
  const r = input as Partial<MasterChatResponse>;
  if (typeof r.understanding !== 'string') {
    return { ok: false, reason: 'understanding missing or not a string' };
  }
  if (!Array.isArray(r.affected_priorities)) {
    return { ok: false, reason: 'affected_priorities missing or not an array' };
  }
  if (!Array.isArray(r.proposed_actions)) {
    return { ok: false, reason: 'proposed_actions missing or not an array' };
  }
  if (typeof r.preview_summary !== 'string') {
    return { ok: false, reason: 'preview_summary missing or not a string' };
  }
  return { ok: true, response: r as MasterChatResponse };
}
