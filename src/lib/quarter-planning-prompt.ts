import type { Priority, PriorityMemory, Quarter, QuarterWeekFocus, User } from '@/db/schema';

export type BuildQuarterSystemPromptInput = {
  user: Pick<User, 'name' | 'email'>;
  priority: Priority;
  quarter: Quarter;
  totalWeeks: number;
  alreadyClaimedWeeks: { weekNumber: number; focusLabel: string }[];
  recentMemory: PriorityMemory[];
};

/**
 * Build the system prompt for Quarter Planning. Templates the verbatim
 * Prompt 4 from priorities-tdd.md:1224-1250 with the runtime values for
 * this Priority + Quarter. **Do not paraphrase** — only substitute the
 * bracketed placeholders.
 */
export function buildQuarterSystemPrompt(input: BuildQuarterSystemPromptInput): string {
  const userName = input.user.name?.trim() || input.user.email.split('@')[0] || 'the user';
  const memoryLines = input.recentMemory.map((m) => {
    const ts = m.createdAt.toISOString().slice(0, 10);
    return `- [${ts}] ${m.body}`;
  });
  const memoryBlock = [
    input.priority.pinnedSummary?.trim() ? input.priority.pinnedSummary.trim() : '(no pinned summary)',
    memoryLines.length > 0 ? memoryLines.join('\n') : '(no memory entries yet)',
  ].join('\n\n');

  const claimedLines =
    input.alreadyClaimedWeeks.length === 0
      ? '(none)'
      : input.alreadyClaimedWeeks
          .map((w) => `- Week ${w.weekNumber}: ${w.focusLabel}`)
          .join('\n');

  return [
    `You are the ${input.priority.name} Priority for ${userName}'s council.`,
    '',
    `Your SMART goal: ${input.priority.smartGoal ?? '(not set)'}`,
    `Your quarterly planning strategy: ${input.priority.quarterlyStrategy ?? '(not set)'}`,
    `Your relevant memory:`,
    memoryBlock,
    '',
    `Current quarter: ${input.quarter.quarterLabel} (${input.quarter.startDate} to ${input.quarter.endDate})`,
    `Number of weeks in this quarter: ${input.totalWeeks} (13 for a full quarter, fewer for partial)`,
    '',
    `Your job in this conversation: help the user define a focus or plan for each of the ${input.totalWeeks} weeks of this quarter, as it relates to your Priority.`,
    '',
    `Already-claimed weeks by higher-priority Priorities:`,
    claimedLines,
    '',
    `Your output options:`,
    `- Use the tool \`set_week_focus(week_number, focus_label)\` to set focus for any week. Focus_label is a short string (e.g., "Base — 4 workouts/wk", "Recovery week", "Big race")`,
    `- Tool \`add_memory(body, tags)\` to capture context worth remembering for future sessions`,
    '',
    `Style:`,
    `- Conversational. Walk through what makes sense for this quarter.`,
    `- Reference what you know about the user (from your memory) when relevant.`,
    `- If you have nothing to plan for a particular week, leave it unset.`,
    `- When done, call \`signal_done()\` to indicate you've finished planning.`,
  ].join('\n');
}

/** Convenience for building the local-only first assistant message that
 *  primes the broad-strokes-first pass (per M12 design decision 10). This
 *  message is rendered in the UI but NEVER sent to Anthropic. */
export function buildBroadStrokesOpener(priorityName: string, totalWeeks: number): string {
  return [
    `Let's plan ${totalWeeks} ${totalWeeks === 1 ? 'week' : 'weeks'} for **${priorityName}**.`,
    '',
    `Start broad — give me a 1-2 word theme for each week (e.g., "Base", "Build 1", "Peak", "Recovery"). We'll drill into details after.`,
  ].join('\n');
}

/** Pull the relevant fields from a QuarterWeekFocus[] for the
 *  "already-claimed" block in the system prompt. Filters to weeks claimed
 *  by OTHER priorities (the current priority's own claims are part of the
 *  conversation history, not the system prompt). */
export function alreadyClaimedByOthers(
  rows: QuarterWeekFocus[],
  currentPriorityId: string,
): { weekNumber: number; focusLabel: string }[] {
  return rows
    .filter((r) => r.priorityId !== currentPriorityId)
    .map((r) => ({ weekNumber: r.weekNumber, focusLabel: r.focusLabel }))
    .sort((a, b) => a.weekNumber - b.weekNumber);
}
