import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { NextResponse } from 'next/server';
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
import { recordCallCost, withinCostCap } from '@/lib/cost-cap';
import { acquireLock, releaseLock } from '@/lib/generation-locks';
import { getOrCreateOnboardingSession } from '@/lib/onboarding';
import { buildOnboardingInterviewPrompt } from '@/lib/onboarding-prompt';
import { encodeSseEvent, SSE_HEADERS, type SseEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Generous fixed budget — the interview is conversational and short-turn;
// no verbosity setting applies (Onboarding Coach is its own flow).
const MAX_OUTPUT_TOKENS = 1500;

type ChatRequestBody = { message: string };

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
  if (!session) return jsonError(401, 'unauthorized', 'Sign in to continue.');

  const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return jsonError(400, 'bad_request', 'message required.');
  }

  const userId = session.user.id;
  const chatSession = await getOrCreateOnboardingSession(userId);

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

  const projectedUsd = projectedCallUsd(model, estimatedInputTokens, MAX_OUTPUT_TOKENS);
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

  await appendUserMessage(chatSession.id, body.message);

  const lockResult = await acquireLock(userId, 'onboarding');
  if (!lockResult.acquired) {
    return singleSseResponse({
      type: 'lock_busy',
      try_again_in_ms: lockResult.tryAgainInMs,
    });
  }

  const systemPrompt = buildOnboardingInterviewPrompt();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SseEvent) => controller.enqueue(encodeSseEvent(event));
      try {
        const thread = await loadThread(chatSession.id);
        const apiStream = client.messages.stream({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: thread,
        });

        for await (const evt of apiStream) {
          if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
            send({ type: 'text_delta', text: evt.delta.text });
          }
        }

        const final = await apiStream.finalMessage();
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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream crashed';
        console.error('onboarding stream error:', message);
        send({ type: 'error', code: 'stream_error', message });
      } finally {
        await releaseLock(userId, 'onboarding');
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
