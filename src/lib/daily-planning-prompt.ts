import { formatInTimeZone } from 'date-fns-tz';
import type { Priority, PriorityMemory, User } from '@/db/schema';
import type {
  AlreadyBlockedItem,
  CurrentPriorityEvent,
  CurrentPriorityTask,
  DailyContext,
} from '@/lib/daily-context';
import { dayLabel } from '@/lib/daily-utils';

export type BuildDailySystemPromptInput = {
  user: Pick<User, 'name' | 'email'>;
  priority: Priority;
  dateISO: string;
  recentMemory: PriorityMemory[];
  context: DailyContext;
  userTimezone: string;
};

/**
 * Build the system prompt for Daily Planning. Templates Verbatim Prompt 6
 * from priorities-tdd.md:1284-1314 — DO NOT paraphrase, only substitute the
 * bracketed placeholders.
 */
export function buildDailySystemPrompt(input: BuildDailySystemPromptInput): string {
  const userName = input.user.name?.trim() || input.user.email.split('@')[0] || 'the user';

  const memoryLines = input.recentMemory.map((m) => {
    const ts = m.createdAt.toISOString().slice(0, 10);
    return `- [${ts}] ${m.body}`;
  });
  const memoryBlock = [
    input.priority.pinnedSummary?.trim() ? input.priority.pinnedSummary.trim() : '(no pinned summary)',
    memoryLines.length > 0 ? memoryLines.join('\n') : '(no memory entries yet)',
  ].join('\n\n');

  const tasksBlock =
    input.context.tasksForCurrentPriority.length === 0
      ? '(none)'
      : input.context.tasksForCurrentPriority
          .map((t) => describeUntimedTask(t))
          .join('\n');

  const eventsBlock =
    input.context.eventsForCurrentPriority.length === 0
      ? '(none)'
      : input.context.eventsForCurrentPriority
          .map((e) => describeOwnEvent(e, input.userTimezone))
          .join('\n');

  const blockedBlock =
    input.context.alreadyBlockedByHigherPriorities.length === 0 &&
    input.context.calendarFeedEvents.length === 0
      ? '(none)'
      : [
          ...input.context.alreadyBlockedByHigherPriorities.map((it) =>
            describeBlockedByHigher(it, input.userTimezone),
          ),
          ...input.context.calendarFeedEvents.map((fe) => {
            if (fe.allDay) {
              return `- [calendar] ${fe.title} (all day)`;
            }
            const s = formatInTimeZone(fe.startTime, input.userTimezone, 'h:mm a');
            const e = formatInTimeZone(fe.endTime, input.userTimezone, 'h:mm a');
            return `- ${s}–${e} [calendar] ${fe.title}`;
          }),
        ]
          .sort()
          .join('\n');

  const dayOfWeek = formatInTimeZone(
    new Date(`${input.dateISO}T12:00:00.000Z`),
    input.userTimezone,
    'EEEE',
  );
  const dateLabel = dayLabel(input.dateISO, input.userTimezone);

  return [
    `You are the ${input.priority.name} Priority for ${userName}'s council.`,
    '',
    `Your SMART goal: ${input.priority.smartGoal ?? '(not set)'}`,
    `Your daily planning strategy: ${input.priority.dailyStrategy ?? '(not set)'}`,
    `Your relevant memory: [PINNED_SUMMARY + 10 most recent entries]`,
    memoryBlock,
    '',
    `Tomorrow's date: ${input.dateISO} (${dateLabel})`,
    `Tomorrow's day of week: ${dayOfWeek}`,
    '',
    `Tasks for you tomorrow (from weekly plan, not yet time-blocked):`,
    tasksBlock,
    '',
    `Events for you tomorrow (already time-blocked):`,
    eventsBlock,
    '',
    `Already-blocked time tomorrow (by higher-priority Priorities or calendar feeds):`,
    blockedBlock,
    '',
    `Your job: time-block your tasks for tomorrow. For each task, suggest a start/end time that fits around already-blocked time and makes sense for the task type.`,
    '',
    `Tools:`,
    `- set_task_time_block(task_id, start_time, end_time) — assign time slot`,
    `- create_event(title, start_time, end_time, description?) — if you need to add a new time-blocked thing`,
    `- add_memory(body, tags)`,
    `- signal_done()`,
    '',
    `Style: efficient. For routine items (e.g., morning routine), default to user's typical times. For flexible items, suggest based on energy fit (deep work mornings, recovery evenings, etc.).`,
  ].join('\n');
}

function describeUntimedTask(t: CurrentPriorityTask): string {
  return `- [task ${t.id}] ${t.title}${t.description ? ' — ' + truncate(t.description, 120) : ''}`;
}

function describeOwnEvent(e: CurrentPriorityEvent, tz: string): string {
  const s = formatInTimeZone(e.startTime, tz, 'h:mm a');
  const en = formatInTimeZone(e.endTime, tz, 'h:mm a');
  return `- ${s}–${en} ${e.title}`;
}

function describeBlockedByHigher(item: AlreadyBlockedItem, tz: string): string {
  const s = formatInTimeZone(item.startUtc, tz, 'h:mm a');
  const e = formatInTimeZone(item.endUtc, tz, 'h:mm a');
  const label = item.kind === 'task' ? item.task?.title : item.event?.title;
  return `- ${s}–${e} [${item.priorityName}] ${item.kind}: ${label ?? '(untitled)'}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Local-only opener message for the Daily Plan ChatPanel. Domain-neutral —
 *  no examples — like the M13 weekly opener. */
export function buildDailyOpener(
  priorityName: string,
  dateLabel: string,
  taskCount: number,
): string {
  const tasksLine =
    taskCount === 0
      ? `You have no untimed tasks for tomorrow yet — but you can add new time-blocked items if you want.`
      : taskCount === 1
        ? `You have 1 task to time-block for tomorrow.`
        : `You have ${taskCount} tasks to time-block for tomorrow.`;
  return [
    `Let's plan tomorrow (${dateLabel}) for **${priorityName}**.`,
    '',
    tasksLine,
    '',
    `Suggest start/end times that fit around what's already blocked. We'll lock them in one at a time.`,
  ].join('\n');
}
