/**
 * Anthropic models the user can select for chatbot calls. Stored in
 * user_settings.selected_model; read by M12+ planning chatbots when
 * constructing the SDK message.
 *
 * IDs match what Anthropic publishes for the latest 4.x family. Update when
 * a newer family ships.
 */
export const ANTHROPIC_MODELS = [
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    blurb: 'Cheapest. Fast. Best for testing or low-stakes calls.',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    blurb: 'Balanced cost + capability. Good default for real planning.',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    blurb: 'Most capable. Highest cost. Use when reasoning matters most.',
  },
] as const;

export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]['id'];

export const DEFAULT_MODEL_ID: AnthropicModelId = 'claude-haiku-4-5-20251001';

export const ANTHROPIC_MODEL_IDS = ANTHROPIC_MODELS.map((m) => m.id) as readonly AnthropicModelId[];

export function isValidModelId(id: string): id is AnthropicModelId {
  return (ANTHROPIC_MODEL_IDS as readonly string[]).includes(id);
}
