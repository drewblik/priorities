import type { PriorityMemory } from '@/db/schema';

/**
 * Verbatim Prompt 8 from priorities-tdd.md:1358-1382. DO NOT paraphrase
 * (CLAUDE.md). Only the bracketed placeholders are substituted. Run as a
 * non-streaming Haiku call; output is the new pinned_summary text only.
 */
export function buildMemorySummarizePrompt(input: {
  priorityName: string;
  currentPinnedSummary: string | null;
  archivedEntries: PriorityMemory[];
}): string {
  const summary = input.currentPinnedSummary?.trim()
    ? input.currentPinnedSummary.trim()
    : '(none yet)';
  const entries = input.archivedEntries
    .map((e) => {
      const ts = e.createdAt.toISOString().slice(0, 10);
      const tags = Array.isArray(e.tags) && e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
      return `- { created_at: ${ts}, source: ${e.source}${tags} } ${e.body}`;
    })
    .join('\n');

  return [
    `You are compressing memory for the ${input.priorityName} Priority — a chatbot persona that helps the user plan a specific area of their life.`,
    '',
    `Existing pinned summary (the long-term memory of this Priority):`,
    summary,
    '',
    `Older memory entries being archived (will no longer be visible to the chatbot after this compression):`,
    entries || '(none)',
    '',
    `Your job: produce an updated pinned_summary that integrates the most important enduring context from the older entries. Output ONLY the new summary text — no preamble, no markdown headers, no commentary.`,
    '',
    `Guidelines:`,
    `- Keep enduring patterns and anchoring facts (e.g., "User has piano lessons every Tuesday with Maya since Jan 2026").`,
    `- Drop tactical details that won't matter in a month (e.g., "Practiced for 25 minutes on March 5" — drop unless it's part of a meaningful pattern).`,
    `- Keep specific names, dates, places, preferences, and constraints the user has shared.`,
    `- Aim for under 2000 tokens. If the current summary plus integrated context exceeds that, compress further — drop the least-anchoring details.`,
    `- Write in past-tense factual style: "User prefers morning workouts," "User's coach Mike has been recommending more cardio," "User's gym membership at Equinox includes pool access."`,
    `- Preserve emotional/relational context where it would change planning advice (e.g., "User has been feeling burned out — recommend lower-intensity weeks").`,
  ].join('\n');
}
