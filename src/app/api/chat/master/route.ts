import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { formatInTimeZone } from 'date-fns-tz';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
import { db } from '@/db/client';
import { events as eventsTable, tasks as tasksTable } from '@/db/schema';
import { getClientForUser } from '@/lib/anthropic-client';
import {
  estimateInputTokensFromText,
  projectedCallUsd,
} from '@/lib/anthropic-pricing';
import {
  appendAssistantMessage,
  appendUserMessage,
  loadThread,
} from '@/lib/chat-messages';
import { getOrCreateMasterSession } from '@/lib/chat-sessions';
import { recordCallCost, withinCostCap } from '@/lib/cost-cap';
import { acquireLock, releaseLock } from '@/lib/generation-locks';
import {
  buildMasterChatSystemPrompt,
  type CouncilEntry,
  type EntityRef,
} from '@/lib/master-chat-prompt';
import type { ScreenContext } from '@/lib/master-chat-screen-context';
import {
  parseMasterChatResponse,
  SUBMIT_PREVIEW_TOOL,
  unpackMasterChatAssistantBlocks,
} from '@/lib/master-chat-tools';
import { getPrioritiesForUser } from '@/lib/priorities';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 4000;
const RECENT_MESSAGE_WINDOW = 20;

const ScreenContextSchema = z.object({
  page: z.string().min(1).max(500),
  horizon: z.enum(['quarter', 'week', 'day']).optional(),
  current_quarter_id: z.string().max(100).optional(),
  current_week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  current_day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  current_priority_id: z.string().max(100).optional(),
  // current_date / current_time / timezone are injected server-side after
  // validation, so they're accepted-but-ignored if the client sends them.
  current_date: z.string().optional(),
  current_time: z.string().optional(),
  timezone: z.string().optional(),
});

const BodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  screen_context: ScreenContextSchema,
});

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return jsonError(401, 'unauthorized', 'Sign in to use master chat.');

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, 'validation_failed', 'message + screen_context required.');
  }

  const userId = session.user.id;
  const { message } = parsed.data;

  // Inject authoritative current date/time/timezone into the screen
  // context (always fresh; client-sent values ignored). Without this the
  // model can't resolve relative dates like "tomorrow" → it returns
  // placeholders like "<UNKNOWN>" that fail target_date validation.
  const tz = session.user.timezone;
  const now = new Date();
  const screen_context: ScreenContext = {
    ...(parsed.data.screen_context as ScreenContext),
    current_date: formatInTimeZone(now, tz, 'yyyy-MM-dd'),
    current_time: formatInTimeZone(now, tz, 'HH:mm'),
    timezone: tz,
  };

  // Load council + master session in parallel; both are required for the prompt.
  const [allPriorities, chatSession] = await Promise.all([
    getPrioritiesForUser(userId),
    getOrCreateMasterSession(userId),
  ]);

  const council: CouncilEntry[] = allPriorities
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      smartGoal: p.smartGoal,
      pinnedSummary: p.pinnedSummary,
    }));

  // Entity reference list so the model can resolve "the foam rolling
  // session" → a real task_id / event_id for modify_/complete_ actions.
  // Bounded: open/recent tasks + upcoming events for active priorities.
  const priorityNameById = new Map(allPriorities.map((p) => [p.id, p.name]));
  const todayISO = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  const horizonStartUtc = new Date(now.getTime() - 7 * 86_400_000);
  const horizonEndUtc = new Date(now.getTime() + 60 * 86_400_000);
  const [taskRows, eventRows] = await Promise.all([
    db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, userId),
          isNull(tasksTable.deletedAt),
          eq(tasksTable.status, 'open'),
        ),
      )
      .orderBy(desc(tasksTable.createdAt))
      .limit(50),
    db
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.userId, userId),
          isNull(eventsTable.deletedAt),
          gte(eventsTable.startTime, horizonStartUtc),
          lte(eventsTable.startTime, horizonEndUtc),
        ),
      )
      .orderBy(desc(eventsTable.startTime))
      .limit(50),
  ]);
  void todayISO;
  const entityRefs: EntityRef[] = [
    ...taskRows.map((t): EntityRef => ({
      kind: 'task',
      id: t.id,
      title: t.title,
      priorityName: priorityNameById.get(t.ownerPriorityId) ?? '(unknown priority)',
      detail: t.targetDate ? `date ${t.targetDate}` : 'no date · open',
    })),
    ...eventRows.map((e): EntityRef => ({
      kind: 'event',
      id: e.id,
      title: e.title,
      priorityName: priorityNameById.get(e.ownerPriorityId) ?? '(unknown priority)',
      detail: formatInTimeZone(e.startTime, tz, "EEE LLL d, h:mm a"),
    })),
  ];

  // Cost gate (estimate before lock so we fail fast).
  const existingThread = await loadThread(chatSession.id);
  let estimatedInputTokens = estimateInputTokensFromText(message);
  for (const m of existingThread) {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    estimatedInputTokens += estimateInputTokensFromText(c);
  }

  let client;
  let model;
  try {
    const got = await getClientForUser(userId);
    client = got.client;
    model = got.model;
  } catch (err) {
    const code =
      err instanceof Error && err.message === 'anthropic_api_key_not_set'
        ? 'api_key_not_set'
        : 'client_init_failed';
    return jsonError(400, code, 'Set your Anthropic API key in Settings → API Key.');
  }

  const projectedUsd = projectedCallUsd(model, estimatedInputTokens, MAX_OUTPUT_TOKENS);
  const cap = await withinCostCap(userId, projectedUsd);
  if (!cap.ok) {
    return NextResponse.json(
      {
        error: 'cost_blocked',
        message: cap.reason,
        todayUsd: cap.todayUsd,
        monthUsd: cap.monthUsd,
        dailyCapUsd: cap.dailyCapUsd,
        monthlyCapUsd: cap.monthlyCapUsd,
      },
      { status: 402 },
    );
  }

  // Single-flight lock — only one master chat call at a time per user.
  const lockResult = await acquireLock(userId, 'master_chat');
  if (!lockResult.acquired) {
    return NextResponse.json(
      {
        error: 'lock_busy',
        message: 'Another master chat call is in progress. Try again shortly.',
        try_again_in_ms: lockResult.tryAgainInMs,
      },
      { status: 409 },
    );
  }

  try {
    // Persist user message before the LLM call so it shows up in history
    // even if the model fails.
    await appendUserMessage(chatSession.id, message);

    // Recent message window for the system prompt's "Conversation history"
    // block. Just text — the model also gets the full message array via
    // the API's `messages` parameter.
    const recentMessages: { role: 'user' | 'assistant'; text: string }[] = existingThread
      .slice(-RECENT_MESSAGE_WINDOW)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m): { role: 'user' | 'assistant'; text: string } => {
        const text =
          typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content);
        return { role: m.role as 'user' | 'assistant', text };
      });

    const systemPrompt = buildMasterChatSystemPrompt({
      council,
      screenContext: screen_context,
      recentMessages,
      entityRefs,
      newUserMessage: message,
    });

    // We pass the existing thread as messages (Anthropic chat format) PLUS
    // the new user message. The catch: prior master-chat assistant turns
    // contain `tool_use` blocks (the submit_preview call). Anthropic's API
    // requires every tool_use in conversation history to be immediately
    // followed by a tool_result block — but master chat never produces a
    // tool_result (the tool input IS the response). So we transform prior
    // assistant turns into plain-text summaries before sending, preserving
    // the audit trail in chat_messages while keeping the API happy.
    const messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...existingThread.map((m) => {
        const content =
          typeof m.content === 'string'
            ? m.content
            : unpackMasterChatAssistantBlocks(m.content as ContentBlockParam[]).fullSummary;
        return { role: m.role as 'user' | 'assistant', content };
      }),
      { role: 'user', content: message },
    ];

    const completion = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      tools: [SUBMIT_PREVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'submit_preview' },
      messages: messagesForApi,
    });

    const usd = await recordCallCost(chatSession.id, model, {
      input_tokens: completion.usage.input_tokens,
      output_tokens: completion.usage.output_tokens,
    });

    // Persist the assistant response (the full content array including the
    // tool_use block) before parsing — so a parse failure still leaves an
    // auditable record.
    await appendAssistantMessage(
      chatSession.id,
      completion.content as ContentBlockParam[],
      usd,
    );

    // Find the tool_use block (forced by tool_choice; should always be there).
    const toolUse = completion.content.find(
      (b): b is Extract<typeof completion.content[number], { type: 'tool_use' }> =>
        b.type === 'tool_use' && b.name === 'submit_preview',
    );
    if (!toolUse) {
      return jsonError(
        502,
        'no_tool_call',
        'Model did not call submit_preview. Try sending your message again.',
      );
    }

    const parsedResponse = parseMasterChatResponse(toolUse.input);
    if (!parsedResponse.ok) {
      return jsonError(502, 'malformed_response', parsedResponse.reason);
    }

    // Resolve titles for the exact task/event ids the model referenced —
    // regardless of status. The prompt's entityRefs list is open-only, so
    // a done/skipped task the model knew from chat history wouldn't be in
    // it and the card would show a raw id. Look those up directly.
    const refMap = new Map(entityRefs.map((e) => [e.id, e]));
    const taskIdsNeeded = new Set<string>();
    const eventIdsNeeded = new Set<string>();
    for (const a of parsedResponse.response.proposed_actions) {
      if ((a.type === 'modify_task' || a.type === 'complete_task') && !refMap.has(a.task_id)) {
        taskIdsNeeded.add(a.task_id);
      }
      if (a.type === 'modify_event' && !refMap.has(a.event_id)) {
        eventIdsNeeded.add(a.event_id);
      }
    }
    const extraRefs: Array<{ kind: 'task' | 'event'; id: string; title: string }> = [];
    if (taskIdsNeeded.size > 0) {
      const rows = await db
        .select({ id: tasksTable.id, title: tasksTable.title })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.userId, userId),
            isNull(tasksTable.deletedAt),
            inArray(tasksTable.id, [...taskIdsNeeded]),
          ),
        );
      for (const r of rows) extraRefs.push({ kind: 'task', id: r.id, title: r.title });
    }
    if (eventIdsNeeded.size > 0) {
      const rows = await db
        .select({ id: eventsTable.id, title: eventsTable.title })
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.userId, userId),
            isNull(eventsTable.deletedAt),
            inArray(eventsTable.id, [...eventIdsNeeded]),
          ),
        );
      for (const r of rows) extraRefs.push({ kind: 'event', id: r.id, title: r.title });
    }

    return NextResponse.json({
      ok: true,
      response: parsedResponse.response,
      /** Server-issued timestamp the client echoes on confirm. Used to
       *  enforce the 5-minute preview expiry per TDD §679. M17 reads this
       *  in the confirm route. */
      preview_generated_at: new Date().toISOString(),
      /** id→title map so the preview card can render task/event titles
       *  instead of raw ids. Includes the open/upcoming list PLUS exact
       *  resolution for any referenced id of any status. */
      entity_refs: [
        ...entityRefs.map((e) => ({ kind: e.kind, id: e.id, title: e.title })),
        ...extraRefs,
      ],
      usage: {
        input_tokens: completion.usage.input_tokens,
        output_tokens: completion.usage.output_tokens,
        total_usd: usd,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'master chat call failed';
    console.error('master chat error:', message);
    return jsonError(500, 'master_chat_failed', message);
  } finally {
    await releaseLock(userId, 'master_chat');
  }
}

// History flattening moved to unpackMasterChatAssistantBlocks in
// src/lib/master-chat-tools.ts so both this route AND the page hydration
// share the same extraction logic.
