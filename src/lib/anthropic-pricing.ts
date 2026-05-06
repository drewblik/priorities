import type { AnthropicModelId } from './anthropic-models';

/**
 * Per-model pricing in USD per million tokens. **Update when Anthropic
 * changes pricing.** TDD §1501 documents this drift as an acceptable v1
 * limitation: wrong constants make cost-cap math off by a factor, but
 * don't break functionality.
 *
 * Last reviewed: 2026-05-05 against published 4.x family pricing.
 */
export const PRICING: Record<
  AnthropicModelId,
  { inputUsdPerMTok: number; outputUsdPerMTok: number }
> = {
  'claude-haiku-4-5-20251001': { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
  'claude-sonnet-4-6': { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
  'claude-opus-4-7': { inputUsdPerMTok: 15.0, outputUsdPerMTok: 75.0 },
};

export function pricingForModel(modelId: AnthropicModelId) {
  return PRICING[modelId];
}

export function tokensToUsd(modelId: AnthropicModelId, inputTokens: number, outputTokens: number): number {
  const p = pricingForModel(modelId);
  const inputUsd = (inputTokens / 1_000_000) * p.inputUsdPerMTok;
  const outputUsd = (outputTokens / 1_000_000) * p.outputUsdPerMTok;
  return inputUsd + outputUsd;
}

/**
 * Up-front estimate used by the cost-cap gate before we know the real
 * usage. Generous defaults: assume 1k output tokens (most planning
 * responses are 200-500 tokens; 1k is a safe ceiling). Caller passes a
 * rough input-token count from message length.
 */
export function projectedCallUsd(
  modelId: AnthropicModelId,
  estimatedInputTokens: number,
  estimatedOutputTokens = 1000,
): number {
  return tokensToUsd(modelId, estimatedInputTokens, estimatedOutputTokens);
}

/** Rough input-token estimate from a message string. ~4 chars per token
 *  is the OpenAI heuristic; close enough for Anthropic for cap-gate
 *  purposes. */
export function estimateInputTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}
