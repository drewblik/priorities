import type { Priority } from '@/db/schema';
import type { ScreenContext } from '@/lib/master-chat-screen-context';

export type CouncilEntry = Pick<
  Priority,
  'id' | 'name' | 'icon' | 'smartGoal' | 'pinnedSummary'
>;

export type BuildMasterChatSystemPromptInput = {
  council: CouncilEntry[];
  screenContext: ScreenContext;
  /** Recent messages in chronological order. Already truncated to last 20
   *  by the caller. Used for the "Conversation history with master chat:"
   *  block per Prompt 7. */
  recentMessages: { role: 'user' | 'assistant'; text: string }[];
  newUserMessage: string;
};

/**
 * Build the system prompt for Master Chat. Templates Verbatim Prompt 7 from
 * priorities-tdd.md:1316-1356 — DO NOT paraphrase, only substitute the
 * bracketed placeholders.
 *
 * The model is expected to respond by calling the `submit_preview` tool
 * (see src/lib/master-chat-tools.ts). Forced via `tool_choice` on the
 * Anthropic API call.
 */
export function buildMasterChatSystemPrompt(input: BuildMasterChatSystemPromptInput): string {
  const councilLines = input.council.map((p) => {
    const smart = p.smartGoal?.trim() ? p.smartGoal.trim() : '(no SMART goal set)';
    const pinned = p.pinnedSummary?.trim()
      ? p.pinnedSummary.trim()
      : '(no pinned summary)';
    return `- id=${p.id} · name="${p.name}" · icon=${p.icon.color}/${p.icon.style}\n  SMART goal: ${smart}\n  Pinned summary: ${pinned}`;
  });
  const councilBlock = councilLines.length > 0 ? councilLines.join('\n') : '(no active Priorities)';

  const historyLines = input.recentMessages.map((m) => `- ${m.role}: ${m.text}`);
  const historyBlock =
    historyLines.length > 0 ? historyLines.join('\n') : '(no prior messages in this master chat)';

  const screenContextJson = JSON.stringify(input.screenContext, null, 2);

  return [
    `You are the master chat router for Priorities, a life-management app. The user is messaging you about something happening in their life. Your job is to figure out which of their Priorities (chatbot personas) should be updated and propose specific actions.`,
    '',
    `User's council (Priorities):`,
    councilBlock,
    '',
    `User's current screen context:`,
    screenContextJson,
    '',
    `Conversation history with master chat:`,
    historyBlock,
    '',
    `User's new message: ${input.newUserMessage}`,
    '',
    `Output a structured JSON response with this schema:`,
    `{`,
    `  "understanding": "Free-form: what you think the user is saying",`,
    `  "affected_priorities": [{ "id": "...", "reasoning": "Why this Priority is affected" }],`,
    `  "proposed_actions": [<see ProposedAction schema>],`,
    `  "preview_summary": "Human-readable summary of what will happen if the user confirms",`,
    `  "needs_clarification": "If you genuinely don't know what to do, ask the user a question here instead of proposing actions"`,
    `}`,
    '',
    `ProposedAction types you can produce:`,
    `- add_priority_memory: capture something noteworthy in a Priority's memory (e.g., "User added Chopin Nocturne Op 9 No 2 to repertoire" goes into Piano's memory)`,
    `- create_task / modify_task / complete_task: act on tasks`,
    `- create_event / modify_event: act on events`,
    `- reschedule_quarter_week_focus: change a week's focus in the active quarter`,
    `- update_priority_field: change a Priority's structured field`,
    '',
    `Guidelines:`,
    `- Be conservative. If unsure which Priority is affected, set needs_clarification instead of guessing.`,
    `- Use screen context to resolve references like "this", "that", "the Tuesday block", "this week".`,
    `- Multiple Priorities can be affected — that's fine. Propose actions for each.`,
    `- The user will see your preview_summary and either confirm or cancel. Make summaries concrete: "Skip tomorrow's gym, reschedule to Friday 5pm" not "Update gym schedule."`,
    `- Never act without surfacing a preview. Even small changes (a single memory entry) need preview.`,
  ].join('\n');
}
