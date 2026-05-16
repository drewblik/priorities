import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getClientForUser } from '@/lib/anthropic-client';
import {
  estimateInputTokensFromText,
  projectedCallUsd,
} from '@/lib/anthropic-pricing';
import { loadThread } from '@/lib/chat-messages';
import { recordCallCost, withinCostCap } from '@/lib/cost-cap';
import { acquireLock, releaseLock } from '@/lib/generation-locks';
import { getOrCreateOnboardingSession } from '@/lib/onboarding';
import { buildCouncilProposalPrompt } from '@/lib/onboarding-prompt';
import {
  parseCouncilProposal,
  SUBMIT_COUNCIL_PROPOSAL_TOOL,
} from '@/lib/onboarding-proposal-tools';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 6000;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function POST() {
  const session = await getCurrentSession();
  if (!session) return jsonError(401, 'unauthorized', 'Sign in to continue.');

  const userId = session.user.id;
  const chatSession = await getOrCreateOnboardingSession(userId);
  const thread = await loadThread(chatSession.id);

  const userTurns = thread.filter((m) => m.role === 'user').length;
  if (userTurns === 0) {
    return jsonError(
      400,
      'no_interview',
      'Have a short interview with the Coach first, then generate your council.',
    );
  }

  let estimatedInputTokens = 0;
  for (const m of thread) {
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
      { error: 'cost_blocked', message: cap.reason },
      { status: 402 },
    );
  }

  const lock = await acquireLock(userId, 'onboarding');
  if (!lock.acquired) {
    return NextResponse.json(
      { error: 'lock_busy', message: 'An onboarding call is in progress. Try again shortly.' },
      { status: 409 },
    );
  }

  try {
    const completion = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildCouncilProposalPrompt(),
      tools: [SUBMIT_COUNCIL_PROPOSAL_TOOL],
      tool_choice: { type: 'tool', name: 'submit_council_proposal' },
      messages: [
        ...thread.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content:
            typeof m.content === 'string'
              ? m.content
              : (m.content as ContentBlockParam[]),
        })),
        {
          role: 'user' as const,
          content:
            'The interview is complete. Generate my starter council now by calling submit_council_proposal.',
        },
      ],
    });

    await recordCallCost(chatSession.id, model, {
      input_tokens: completion.usage.input_tokens,
      output_tokens: completion.usage.output_tokens,
    });

    const toolUse = completion.content.find(
      (b): b is Extract<typeof completion.content[number], { type: 'tool_use' }> =>
        b.type === 'tool_use' && b.name === 'submit_council_proposal',
    );
    if (!toolUse) {
      return jsonError(
        502,
        'no_tool_call',
        'Model did not return a proposal. Try again.',
      );
    }

    const parsed = parseCouncilProposal(toolUse.input);
    if (!parsed.ok) {
      return jsonError(502, 'malformed_proposal', parsed.reason);
    }

    return NextResponse.json({ ok: true, proposal: parsed.proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'proposal generation failed';
    console.error('onboarding propose error:', message);
    return jsonError(500, 'propose_failed', message);
  } finally {
    await releaseLock(userId, 'onboarding');
  }
}
