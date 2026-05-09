import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** Today's calendar date YYYY-MM-DD in the user's timezone. */
export function todayInTz(userTimezone: string): string {
  return formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
}

/** Tomorrow's calendar date YYYY-MM-DD in the user's timezone. */
export function tomorrowInTz(userTimezone: string): string {
  const today = todayInTz(userTimezone);
  return format(addDays(parseISO(today), 1), 'yyyy-MM-dd');
}

/**
 * UTC bounds for a single calendar day in user TZ. Used by DB range queries
 * over `start_time` / `time_block_start` columns. Mirrors the M9 hotfix
 * pattern (UTC bounds derived from user-TZ midnight, not naïve UTC).
 */
export function dayUtcBounds(
  dateISO: string,
  userTimezone: string,
): { startUtc: Date; endUtc: Date } {
  const startUtc = fromZonedTime(`${dateISO}T00:00:00`, userTimezone);
  const endUtc = fromZonedTime(`${dateISO}T23:59:59.999`, userTimezone);
  return { startUtc, endUtc };
}

/** "Wed May 13" formatted in user TZ. */
export function dayLabel(dateISO: string, userTimezone: string): string {
  const anchor = new Date(`${dateISO}T12:00:00.000Z`);
  return formatInTimeZone(anchor, userTimezone, 'EEE LLL d');
}

/** YYYY-MM-DD pattern check; cheap guard for URL segments. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
