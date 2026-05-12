import { formatInTimeZone } from 'date-fns-tz';
import type { CalendarFeedEvent, Priority, PriorityMemory, Quarter, User } from '@/db/schema';
import type { AlreadyScheduledItem } from '@/lib/weekly-context';

export type BuildWeeklySystemPromptInput = {
  user: Pick<User, 'name' | 'email'>;
  priority: Priority;
  weekStartISO: string;
  weekEndISO: string;
  quarter: Quarter;
  weekNumberInQuarter: number;
  quarterFocusForThisWeek: { focusLabel: string } | null;
  recentMemory: PriorityMemory[];
  alreadyScheduledByHigherPriorities: AlreadyScheduledItem[];
  calendarFeedEvents: CalendarFeedEvent[];
  userTimezone: string;
};

/**
 * Build the system prompt for Weekly Planning. Templates Verbatim Prompt 5
 * from priorities-tdd.md:1257-1282 — DO NOT paraphrase, only substitute
 * the bracketed placeholders.
 */
export function buildWeeklySystemPrompt(input: BuildWeeklySystemPromptInput): string {
  const userName = input.user.name?.trim() || input.user.email.split('@')[0] || 'the user';
  const memoryLines = input.recentMemory.map((m) => {
    const ts = m.createdAt.toISOString().slice(0, 10);
    return `- [${ts}] ${m.body}`;
  });
  const memoryBlock = [
    input.priority.pinnedSummary?.trim() ? input.priority.pinnedSummary.trim() : '(no pinned summary)',
    memoryLines.length > 0 ? memoryLines.join('\n') : '(no memory entries yet)',
  ].join('\n\n');

  const scheduledByDay = groupByDay(input.alreadyScheduledByHigherPriorities);
  const scheduledLines =
    Object.keys(scheduledByDay).length === 0
      ? '(none)'
      : Object.entries(scheduledByDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, items]) => {
            const lines = items
              .map((it) => describeAlreadyScheduled(it, input.userTimezone))
              .join('\n  ');
            return `- ${day}:\n  ${lines}`;
          })
          .join('\n');

  const feedLines =
    input.calendarFeedEvents.length === 0
      ? '(none)'
      : input.calendarFeedEvents
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .map((fe) => {
            if (fe.allDay) {
              const day = fe.startTime.toISOString().slice(0, 10);
              return `- [${day}] ${fe.title} (all day)`;
            }
            const startLabel = formatInTimeZone(fe.startTime, input.userTimezone, 'EEE LLL d, h:mm a');
            const endLabel = formatInTimeZone(fe.endTime, input.userTimezone, 'h:mm a');
            return `- ${startLabel} – ${endLabel}: ${fe.title}`;
          })
          .join('\n');

  const focusLine = input.quarterFocusForThisWeek
    ? `${input.quarterFocusForThisWeek.focusLabel}`
    : '(not set)';

  return [
    `You are the ${input.priority.name} Priority for ${userName}'s council.`,
    '',
    `Your SMART goal: ${input.priority.smartGoal ?? '(not set)'}`,
    `Your weekly planning strategy: ${input.priority.weeklyStrategy ?? '(not set)'}`,
    `Your relevant memory: [PINNED_SUMMARY + 10 most recent entries]`,
    memoryBlock,
    '',
    `Current week: ${input.weekStartISO} to ${input.weekEndISO}`,
    `Quarter context: ${input.quarter.quarterLabel}, week ${input.weekNumberInQuarter} of quarter`,
    `This week's focus for you (from quarter plan): ${focusLine}`,
    '',
    `Already-scheduled by higher-priority Priorities:`,
    scheduledLines,
    '',
    `Calendar feed events this week:`,
    feedLines,
    '',
    `Your job: assign tasks (and/or create events) to specific days of the week for your Priority, working within the week's focus and around already-claimed time.`,
    '',
    `Tools:`,
    `- create_task(title, target_date, description?, recurrence?) — assign a Task to a specific day, no time block yet`,
    `- create_event(title, start_time, end_time, description?, recurrence?) — schedule a time-bound Event`,
    `- add_memory(body, tags)`,
    `- signal_done()`,
    '',
    `Style: brief, action-oriented. Confirm with the user before creating each batch.`,
    '',
    `---`,
    `Operational boundaries (apply to your tools at runtime):`,
    `- You can ONLY create tasks and events owned by ${input.priority.name}. Higher-priority Priorities have already claimed their schedule for the week — those items are FIXED and immovable for you.`,
    `- If the user asks for a day or time that conflicts with another Priority's already-scheduled item, propose an alternative that fits the gaps. DO NOT offer to "move" or "reschedule" another Priority's items — Priorities are planned in a chosen order specifically so that earlier ones have first claim. The user can revise other Priorities later from their detail pages or via re-planning; that's outside this session.`,
    `- Calendar feed events are read-only (synced from external calendars); treat them like any other immovable item.`,
  ].join('\n');
}

function groupByDay(items: AlreadyScheduledItem[]): Record<string, AlreadyScheduledItem[]> {
  const out: Record<string, AlreadyScheduledItem[]> = {};
  for (const item of items) {
    if (!out[item.day]) out[item.day] = [];
    out[item.day].push(item);
  }
  return out;
}

function describeAlreadyScheduled(item: AlreadyScheduledItem, tz: string): string {
  if (item.kind === 'task' && item.task) {
    const t = item.task;
    if (t.timeBlockStart && t.timeBlockEnd) {
      const s = formatInTimeZone(t.timeBlockStart, tz, 'h:mm a');
      const e = formatInTimeZone(t.timeBlockEnd, tz, 'h:mm a');
      return `[${item.priorityName}] task ${s}–${e}: ${t.title}`;
    }
    return `[${item.priorityName}] task: ${t.title}`;
  }
  if (item.kind === 'event' && item.event) {
    const e = item.event;
    const s = formatInTimeZone(e.startTime, tz, 'h:mm a');
    const en = formatInTimeZone(e.endTime, tz, 'h:mm a');
    return `[${item.priorityName}] event ${s}–${en}: ${e.title}`;
  }
  return '';
}

/** Local-only opener message for Weekly ChatPanel. Domain-neutral; no
 *  fitness-coded examples. References the quarter's focus for this week
 *  if set so the user has anchor context. */
export function buildWeeklyOpener(
  priorityName: string,
  weekRangeLabel: string,
  quarterFocusLabel: string | null,
): string {
  const focusLine = quarterFocusLabel
    ? `The quarter focus for this week is **${quarterFocusLabel}**.`
    : `(No quarter focus set for this week yet.)`;
  return [
    `Let's plan the week of ${weekRangeLabel} for **${priorityName}**.`,
    '',
    focusLine,
    '',
    `What's worth scheduling? You can describe the shape of the week or jump straight to specific tasks/events.`,
  ].join('\n');
}
