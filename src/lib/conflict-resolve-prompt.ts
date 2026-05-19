import type { CalendarConflict } from '@/lib/calendar-conflicts';

/**
 * Builds the seed message that pre-fills the Master Chat composer when the
 * user taps "Resolve all in Master Chat" from /conflicts (M21 Phase 3).
 *
 * This is an app-generated *user* turn (first person), NOT one of the 8
 * verbatim LLM prompts — its wording is ours to choose. It carries each
 * conflict with the stable item id inline so the model targets the right
 * entity via modify_task / modify_event, and states the hard rule that
 * external calendar events are immovable.
 *
 * The /api/chat/master route caps `message` at 4000 chars (and the
 * composer textarea mirrors that), so when there are pathologically many
 * conflicts we itemize as many as fit and disclose the remainder rather
 * than emit an over-length message that would 400 the route.
 */

const MAX_LEN = 4000;
/** Headroom for the trailing "(+N more …)" disclosure line. */
const OMISSION_RESERVE = 140;
/** Keep one line bounded even if a title is pathologically long. */
const MAX_TITLE = 100;

const LEAD =
  "I have calendar conflicts to resolve. My external calendar events are " +
  "immovable and take precedence — only move my own planned tasks/events, " +
  "and never propose moving or deleting the calendar events themselves. " +
  'Conflicts:';

const CLOSE =
  "For each conflict, keep the same duration and move my item to the " +
  "nearest sensible free slot within the next 7 days (prefer the same day " +
  "if possible). Propose one modify_task / modify_event per conflict.";

function clampTitle(title: string): string {
  const t = title.trim();
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t;
}

function conflictLine(c: CalendarConflict): string {
  const noun = c.kind === 'event' ? 'event' : 'task';
  return (
    `- ${noun} "${clampTitle(c.itemTitle)}" (id: ${c.itemId}) is blocked ` +
    `${c.itemRange} by immovable calendar event ` +
    `"${clampTitle(c.calendarTitle)}" ${c.calendarRange} — move the ` +
    `${noun} off this slot.`
  );
}

export function buildConflictResolveMessage(conflicts: CalendarConflict[]): {
  message: string;
  shownCount: number;
  omittedCount: number;
} {
  if (conflicts.length === 0) {
    return { message: '', shownCount: 0, omittedCount: 0 };
  }

  const budget = MAX_LEN - LEAD.length - CLOSE.length - OMISSION_RESERVE;
  const lines: string[] = [];
  let used = 0;

  for (const c of conflicts) {
    const line = conflictLine(c);
    // +1 for the newline that will join this line.
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }

  const shownCount = lines.length;
  const omittedCount = conflicts.length - shownCount;

  const parts = [LEAD, lines.join('\n')];
  if (omittedCount > 0) {
    parts.push(
      `(+${omittedCount} more conflict${omittedCount === 1 ? '' : 's'} not ` +
        `listed — resolve these first, then revisit /conflicts.)`,
    );
  }
  parts.push(CLOSE);

  return { message: parts.join('\n\n'), shownCount, omittedCount };
}
