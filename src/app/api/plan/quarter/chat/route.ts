import type {
  ContentBlock,
  ContentBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getClientForUser } from '@/lib/anthropic-client';
import {
  estimateInputTokensFromText,
  projectedCallUsd,
} from '@/lib/anthropic-pricing';
import {
  appendAssistantMessage,
  appendToolResult,
  appendUserMessage,
  loadThread,
} from '@/lib/chat-messages';
import { getSessionByIdForUser } from '@/lib/chat-sessions';
import { verbosityToMaxTokens } from '@/lib/chatbot-verbosity';
import { recordCallCost, withinCostCap } from '@/lib/cost-cap';
import { acquireLock, releaseLock } from '@/lib/generation-locks';
import { getPriorityById } from '@/lib/priorities';
import { getMemoryForPriority } from '@/lib/priority-memory';
import { maybeSummarizeOnSessionStart } from '@/lib/memory-summarize';
import {
  alreadyClaimedByOthers,
  buildQuarterSystemPrompt,
} from '@/lib/quarter-planning-prompt';
import {
  QUARTER_PLANNING_TOOLS,
  executeQuarterTool,
} from '@/lib/quarter-planning-tools';
import { getQuarterById, weeksInQuarter } from '@/lib/quarters';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';
import { getSettingsView } from '@/lib/settings';
import { encodeSseEvent, SSE_HEADERS, type SseEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TOOL_LOOP_TURNS = 8;

type ChatRequestBody = {
  sessionId: string;
  message: string;
};

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

function singleSseResponse(event: SseEvent): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSseEvent(event));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return jsonError(401, 'unauthorized', 'Sign in to chat.');

  const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
  if (!body || typeof body.sessionId !== 'string' || typeof body.message !== 'string') {
    return jsonError(400, 'bad_request', 'sessionId + message required.');
  }
  if (body.message.trim().length === 0) {
    return jsonError(400, 'empty_message', 'Message cannot be empty.');
  }

  const userId = session.user.id;
  const chatSession = await getSessionByIdForUser(userId, body.sessionId);
  if (!chatSession || chatSession.sessionType !== 'quarter' || chatSession.closedAt !== null) {
    return jsonError(404, 'session_not_found', 'No open quarter session.');
  }
  if (!chatSession.priorityId || !chatSession.contextRef) {
    return jsonError(400, 'session_misconfigured', 'Session missing priority or quarter ref.');
  }

  const [priority, quarter] = await Promise.all([
    getPriorityById(userId, chatSession.priorityId),
    getQuarterById(userId, chatSession.contextRef),
  ]);
  if (!priority || !quarter) {
    return jsonError(404, 'priority_or_quarter_not_found', 'Priority or quarter missing.');
  }

  // Up-front cost gate. Estimate from the existing thread + new message.
  const existingThread = await loadThread(chatSession.id);
  let estimatedInputTokens = estimateInputTokensFromText(body.message);
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

  // Verbosity → max_tokens. Lookup once before the loop; same budget per turn.
  const settingsView = await getSettingsView(userId);
  const maxOutputTokens = verbosityToMaxTokens(settingsView?.chatbotVerbosity ?? 'balanced');

  const projectedUsd = projectedCallUsd(model, estimatedInputTokens);
  const cap = await withinCostCap(userId, projectedUsd);
  if (!cap.ok) {
    return singleSseResponse({
      type: 'cost_blocked',
      reason: cap.reason,
      todayUsd: cap.todayUsd,
      monthUsd: cap.monthUsd,
      dailyCapUsd: cap.dailyCapUsd,
      monthlyCapUsd: cap.monthlyCapUsd,
    });
  }

  // Persist the user's new message before opening the lock so it survives
  // a stream crash (we want the user's input retained either way).
  await appendUserMessage(chatSession.id, body.message);

  const lockKey = `plan:quarter:${quarter.id}`;
  const lockResult = await acquireLock(userId, lockKey);
  if (!lockResult.acquired) {
    return singleSseResponse({
      type: 'lock_busy',
      try_again_in_ms: lockResult.tryAgainInMs,
    });
  }

  // Build system prompt + tool context.
  const totalWeeks = weeksInQuarter(quarter.startDate, quarter.endDate);
  await maybeSummarizeOnSessionStart(userId, priority.id);
  const recentMemory = (await getMemoryForPriority(userId, priority.id)).slice(0, 10);
  const allFocus = await getQuarterWeekFocusForQuarter(userId, quarter.id);
  const systemPrompt = buildQuarterSystemPrompt({
    user: { name: session.user.name ?? null, email: session.user.email },
    priority,
    quarter,
    totalWeeks,
    alreadyClaimedWeeks: alreadyClaimedByOthers(allFocus, priority.id),
    recentMemory,
  });

  const toolCtx = { userId, quarterId: quarter.id, priorityId: priority.id };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SseEvent) => controller.enqueue(encodeSseEvent(event));
      let signaledDone = false;

      try {
        for (let turn = 0; turn < MAX_TOOL_LOOP_TURNS; turn++) {
          // Re-load the thread each turn so newly-appended assistant + tool
          // results are included in the next call.
          const thread = await loadThread(chatSession.id);
          const apiStream = client.messages.stream({
            model,
            max_tokens: maxOutputTokens,
            system: systemPrompt,
            tools: QUARTER_PLANNING_TOOLS,
            messages: thread,
          });

          for await (const evt of apiStream) {
            if (
              evt.type === 'content_block_delta' &&
              evt.delta.type === 'text_delta'
            ) {
              send({ type: 'text_delta', text: evt.delta.text });
            }
          }

          const final = await apiStream.finalMessage();

          // Persist the assistant turn (text + tool_use blocks). Cost is
          // recorded both on the per-message row AND the session total.
          const usd = await recordCallCost(chatSession.id, model, {
            input_tokens: final.usage.input_tokens,
            output_tokens: final.usage.output_tokens,
          });
          await appendAssistantMessage(
            chatSession.id,
            final.content as ContentBlockParam[],
            usd,
          );
          send({
            type: 'message_done',
            usage: {
              input_tokens: final.usage.input_tokens,
              output_tokens: final.usage.output_tokens,
              total_usd: usd,
            },
          });

          const toolUseBlocks = final.content.filter(
            (b: ContentBlock): b is Extract<ContentBlock, { type: 'tool_use' }> =>
              b.type === 'tool_use',
          );
          if (toolUseBlocks.length === 0) break;

          const toolResults: ToolResultBlockParam[] = [];
          let signaledThisRound = false;
          for (const block of toolUseBlocks) {
            send({
              type: 'tool_use_start',
              id: block.id,
              name: block.name,
              input: block.input,
            });
            const result = await executeQuarterTool(block.name, block.input, toolCtx);
            send(
              result.ok
                ? { type: 'tool_result', id: block.id, ok: true, payload: result.payload }
                : { type: 'tool_result', id: block.id, ok: false, reason: result.reason },
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.ok
                ? JSON.stringify(result.payload ?? {})
                : `error: ${result.reason}`,
              is_error: !result.ok,
            });
            if (block.name === 'signal_done' && result.ok) {
              signaledThisRound = true;
            }
          }

          // Persist the tool_result turn so the next loop iteration's
          // loadThread() picks it up.
          await appendToolResult(chatSession.id, toolResults as ContentBlockParam[]);

          if (signaledThisRound) {
            send({ type: 'signal_done' });
            signaledDone = true;
            break;
          }
        }

        void signaledDone;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream crashed';
        console.error('quarter-plan stream error:', message);
        send({ type: 'error', code: 'stream_error', message });
      } finally {
        await releaseLock(userId, lockKey);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
