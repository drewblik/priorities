import type { Tool } from '@anthropic-ai/sdk/resources/messages';

/** Council Proposal shape per Verbatim Prompt 2 (priorities-tdd.md:1161-1180).
 *  The model is forced to call submit_council_proposal so output is always
 *  this structure (same tool-forcing pattern as M16 master chat). */
export type ProposedPriority = {
  name: string;
  icon: { color: string; style: 'classic' | 'rounded' | 'serif' | 'script' };
  smart_goal: string;
  quarterly_strategy: string;
  weekly_strategy: string;
  daily_strategy: string;
  min_minutes_per_week: number;
  max_minutes_per_week: number;
  check_in_cadence: Array<'quarterly' | 'weekly' | 'daily'>;
  starter_memory_entries: Array<{ body: string; tags: string[] }>;
};

export type CouncilProposal = {
  proposed_priorities: ProposedPriority[];
  rationale: string;
};

export const SUBMIT_COUNCIL_PROPOSAL_TOOL: Tool = {
  name: 'submit_council_proposal',
  description:
    'Submit the starter council proposal. ALWAYS call this exactly once — the user only sees what you pass here.',
  input_schema: {
    type: 'object',
    properties: {
      proposed_priorities: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            icon: {
              type: 'object',
              properties: {
                color: { type: 'string', description: 'hex like #2563eb' },
                style: { type: 'string', enum: ['classic', 'rounded', 'serif', 'script'] },
              },
              required: ['color', 'style'],
            },
            smart_goal: { type: 'string', maxLength: 2000 },
            quarterly_strategy: { type: 'string', maxLength: 2000 },
            weekly_strategy: { type: 'string', maxLength: 2000 },
            daily_strategy: { type: 'string', maxLength: 2000 },
            min_minutes_per_week: { type: 'integer', minimum: 0, maximum: 10000 },
            max_minutes_per_week: { type: 'integer', minimum: 0, maximum: 10000 },
            check_in_cadence: {
              type: 'array',
              items: { type: 'string', enum: ['quarterly', 'weekly', 'daily'] },
              minItems: 1,
            },
            starter_memory_entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  body: { type: 'string', minLength: 1, maxLength: 10000 },
                  tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
                },
                required: ['body'],
              },
            },
          },
          required: [
            'name',
            'icon',
            'smart_goal',
            'quarterly_strategy',
            'weekly_strategy',
            'daily_strategy',
            'min_minutes_per_week',
            'max_minutes_per_week',
            'check_in_cadence',
            'starter_memory_entries',
          ],
        },
      },
      rationale: { type: 'string', maxLength: 4000 },
    },
    required: ['proposed_priorities', 'rationale'],
  },
};

const VALID_STYLES = new Set(['classic', 'rounded', 'serif', 'script']);
const VALID_CADENCE = new Set(['quarterly', 'weekly', 'daily']);

/** Light validation/normalization of the tool input. Tool-forcing already
 *  enforces the schema; this clamps + defaults defensively so a slightly
 *  off model response still yields a usable proposal. */
export function parseCouncilProposal(
  input: unknown,
): { ok: true; proposal: CouncilProposal } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'tool input is not an object' };
  }
  const r = input as Partial<CouncilProposal>;
  if (!Array.isArray(r.proposed_priorities) || r.proposed_priorities.length === 0) {
    return { ok: false, reason: 'proposed_priorities missing or empty' };
  }

  const cleaned: ProposedPriority[] = [];
  for (const p of r.proposed_priorities) {
    if (!p || typeof p !== 'object') continue;
    const pp = p as Partial<ProposedPriority>;
    const name = typeof pp.name === 'string' ? pp.name.trim().slice(0, 120) : '';
    if (!name) continue;
    const color =
      pp.icon && typeof pp.icon.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(pp.icon.color)
        ? pp.icon.color
        : '#2563eb';
    const style =
      pp.icon && typeof pp.icon.style === 'string' && VALID_STYLES.has(pp.icon.style)
        ? pp.icon.style
        : 'rounded';
    const cadence = Array.isArray(pp.check_in_cadence)
      ? pp.check_in_cadence.filter(
          (c): c is 'quarterly' | 'weekly' | 'daily' =>
            typeof c === 'string' && VALID_CADENCE.has(c),
        )
      : [];
    const minM = clampInt(pp.min_minutes_per_week, 0, 10000, 0);
    const maxM = clampInt(pp.max_minutes_per_week, 0, 10000, Math.max(minM, 60));
    const mem = Array.isArray(pp.starter_memory_entries)
      ? pp.starter_memory_entries
          .filter((m) => m && typeof m.body === 'string' && m.body.trim().length > 0)
          .map((m) => ({
            body: m.body.trim().slice(0, 10000),
            tags: Array.isArray(m.tags)
              ? m.tags
                  .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                  .map((t) => t.trim().toLowerCase())
                  .slice(0, 10)
              : [],
          }))
      : [];
    cleaned.push({
      name,
      icon: { color, style: style as ProposedPriority['icon']['style'] },
      smart_goal: strOrEmpty(pp.smart_goal, 2000),
      quarterly_strategy: strOrEmpty(pp.quarterly_strategy, 2000),
      weekly_strategy: strOrEmpty(pp.weekly_strategy, 2000),
      daily_strategy: strOrEmpty(pp.daily_strategy, 2000),
      min_minutes_per_week: minM,
      max_minutes_per_week: maxM < minM ? minM : maxM,
      check_in_cadence: cadence.length > 0 ? cadence : ['weekly'],
      starter_memory_entries: mem,
    });
  }

  if (cleaned.length === 0) {
    return { ok: false, reason: 'no valid priorities after normalization' };
  }
  return {
    ok: true,
    proposal: {
      proposed_priorities: cleaned,
      rationale: strOrEmpty(r.rationale, 4000),
    },
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function strOrEmpty(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
