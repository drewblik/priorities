import { formatInTimeZone } from 'date-fns-tz';
import type { Recurrence, Task, Event } from '@/db/schema';

const WEEKDAY_LABELS: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

/**
 * Render a task's schedule line in the user's TZ, e.g.:
 *   "Tue May 12 · 9:00–10:00 AM"
 *   "Tue May 12"
 *   "Unscheduled"
 */
export function taskScheduleLine(task: Task, tz: string): string {
  if (task.timeBlockStart && task.timeBlockEnd) {
    const day = formatInTimeZone(task.timeBlockStart, tz, 'EEE LLL d');
    const start = formatInTimeZone(task.timeBlockStart, tz, 'h:mm a');
    const end = formatInTimeZone(task.timeBlockEnd, tz, 'h:mm a');
    return `${day} · ${start}–${end}`;
  }
  if (task.targetDate) {
    // task.targetDate is a YYYY-MM-DD string from Postgres date.
    // Treat as a calendar date in the user's TZ — formatInTimeZone with
    // a noon UTC anchor avoids midnight-rollover oddities at TZ boundaries.
    const anchor = new Date(`${task.targetDate}T12:00:00.000Z`);
    return formatInTimeZone(anchor, tz, 'EEE LLL d');
  }
  return 'Unscheduled';
}

export function eventScheduleLine(event: Event, tz: string): string {
  const day = formatInTimeZone(event.startTime, tz, 'EEE LLL d');
  const start = formatInTimeZone(event.startTime, tz, 'h:mm a');
  const end = formatInTimeZone(event.endTime, tz, 'h:mm a');
  return `${day} · ${start}–${end}`;
}

/** Time range without the date prefix; used in Daily View where the date is in the page header. */
export function timeRangeOnly(start: Date, end: Date, tz: string): string {
  const s = formatInTimeZone(start, tz, 'h:mm a');
  const e = formatInTimeZone(end, tz, 'h:mm a');
  return `${s}–${e}`;
}

export function recurrenceLabel(rec: Recurrence | null): string | null {
  if (!rec) return null;
  let core: string;
  if (rec.type === 'daily') {
    core = rec.interval === 1 ? 'Repeats daily' : `Repeats every ${rec.interval} days`;
  } else if (rec.type === 'weekly') {
    const days = (rec.byday ?? []).map((d) => WEEKDAY_LABELS[d] ?? d).join(', ');
    const cadence = rec.interval === 1 ? 'Repeats weekly' : `Repeats every ${rec.interval} weeks`;
    core = days.length > 0 ? `${cadence} on ${days}` : cadence;
  } else {
    const day = rec.bymonthday ?? '?';
    const cadence =
      rec.interval === 1 ? 'Repeats monthly' : `Repeats every ${rec.interval} months`;
    core = `${cadence} on the ${day}${ordinalSuffix(Number(day) || 0)}`;
  }
  if (rec.until) core += ` (until ${rec.until})`;
  return core;
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/**
 * Convert a UTC Date to the YYYY-MM-DDTHH:mm string accepted by HTML
 * datetime-local inputs, in the given user TZ. Returns '' for null/undefined.
 */
export function toDatetimeLocal(d: Date | null | undefined, tz: string): string {
  if (!d) return '';
  return formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm");
}

export function overrideLabelFor(
  task: { instanceOfTaskId: string | null; targetDate: string | null },
): string | null {
  if (!task.instanceOfTaskId) return null;
  return `Override · ${task.targetDate ?? '?'}`;
}

export function eventOverrideLabelFor(
  event: { instanceOfEventId: string | null; startTime: Date },
  tz: string,
): string | null {
  if (!event.instanceOfEventId) return null;
  return `Override · ${formatInTimeZone(event.startTime, tz, 'LLL d')}`;
}
