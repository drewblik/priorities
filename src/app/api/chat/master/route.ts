import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
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
} from '@/lib/master-chat-prompt';
import type { ScreenContext } from '@/lib/master-chat-screen-context';
import {
  parseMasterChatResponse,
  SUBMIT_PREVIEW_TOOL,
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
  const { message, screen_context } = parsed.data;

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
      screenContext: screen_context as ScreenContext,
      recentMessages,
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
      ...existingThread.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content:
          typeof m.content === 'string'
            ? m.content
            : flattenMasterChatHistory(m.content as ContentBlockParam[]),
      })),
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

    return NextResponse.json({
      ok: true,
      response: parsedResponse.response,
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

/**
 * Turn a content array containing `submit_preview` tool_use blocks into a
 * plain-text summary suitable for Anthropic's `messages` API on subsequent
 * turns. Anthropic rejects tool_use blocks in history that aren't followed
 * by a tool_result block (which master chat doesn't produce — the tool
 * input IS the response).
 *
 * We extract `understanding` + `preview_summary` + a compact action list
 * from each tool_use input. Any plain text blocks are appended afterward.
 */
function flattenMasterChatHistory(blocks: ContentBlockParam[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.text.trim().length > 0) parts.push(block.text);
      continue;
    }
    if (block.type === 'tool_use' && block.name === 'submit_preview') {
      const input = (block.input ?? {}) as {
        understanding?: string;
        preview_summary?: string;
        needs_clarification?: string;
        proposed_actions?: Array<{ type?: string }>;
      };
      const segments: string[] = [];
      if (input.understanding) segments.push(`Understanding: ${input.understanding}`);
      if (input.preview_summary) segments.push(`Preview: ${input.preview_summary}`);
      if (input.needs_clarification) {
        segments.push(`Needs clarification: ${input.needs_clarification}`);
      }
      if (Array.isArray(input.proposed_actions) && input.proposed_actions.length > 0) {
        const actionTypes = input.proposed_actions
          .map((a) => (typeof a?.type === 'string' ? a.type : 'unknown'))
          .join(', ');
        segments.push(`Proposed actions: ${actionTypes}`);
      }
      if (segments.length > 0) parts.push(segments.join('\n'));
    }
    // Other block types (tool_result, etc.) shouldn't appear in master chat
    // history. Skip silently.
  }

  return parts.join('\n\n') || '(empty)';
}
