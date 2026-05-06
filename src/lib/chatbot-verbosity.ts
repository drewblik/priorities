/**
 * Chatbot verbosity controls per-call max_tokens. Three discrete levels;
 * persisted as `user_settings.chatbot_verbosity`. M12 Quarter chat + M13
 * Weekly chat both read it. Respects CLAUDE.md "do not paraphrase verbatim
 * prompts" — only the response budget changes, no prompt edits.
 *
 * For finer control (per-flow caps, system-prompt addendums, A/B testing),
 * see the post-v1 prompt-engineering tooling backlog item.
 */

export const VERBOSITY_LEVELS = [
  {
    id: 'terse',
    label: 'Terse',
    blurb: 'Short, action-first replies. Cheapest. Skip explanations unless asked.',
    maxTokens: 500,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: "Default. Conversational with room for context, but won't ramble.",
    maxTokens: 1000,
  },
  {
    id: 'detailed',
    label: 'Detailed',
    blurb: 'Longer explanations + reasoning. Best for high-stakes planning. Most expensive.',
    maxTokens: 2000,
  },
] as const;

export type ChatbotVerbosity = (typeof VERBOSITY_LEVELS)[number]['id'];

export const VERBOSITY_IDS = VERBOSITY_LEVELS.map((v) => v.id) as readonly ChatbotVerbosity[];

export const DEFAULT_VERBOSITY: ChatbotVerbosity = 'balanced';

export function verbosityToMaxTokens(level: ChatbotVerbosity): number {
  const match = VERBOSITY_LEVELS.find((v) => v.id === level);
  return match?.maxTokens ?? 1000;
}

export function isValidVerbosity(level: string): level is ChatbotVerbosity {
  return (VERBOSITY_IDS as readonly string[]).includes(level);
}
