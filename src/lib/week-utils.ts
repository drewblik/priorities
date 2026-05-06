import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { Quarter } from '@/db/schema';

/**
 * Monday of the week containing dateISO, computed in the user's timezone.
 * Returns YYYY-MM-DD. M13 uses this for the weekStartDate URL parameter.
 *
 * "Mon-Sun" is the FDD's week convention. To get the Monday of the
 * containing week reliably across DST, we compute in user-TZ space:
 * format the input date in user TZ, find its day-of-week, subtract that
 * many days, format back.
 */
export function weekStartForDate(dateISO: string, userTimezone: string): string {
  // formatInTimeZone with 'i' gives ISO weekday 1=Mon..7=Sun.
  const anchor = new Date(`${dateISO}T12:00:00.000Z`);
  const isoWeekday = Number.parseInt(formatInTimeZone(anchor, userTimezone, 'i'), 10);
  const offset = isoWeekday - 1;
  const monday = addDays(parseISO(dateISO), -offset);
  return format(monday, 'yyyy-MM-dd');
}

/** "Mon May 4 – Sun May 10" formatted in the user's TZ. */
export function weekRangeLabel(weekStartISO: string, userTimezone: string): string {
  const startAnchor = new Date(`${weekStartISO}T12:00:00.000Z`);
  const endISO = format(addDays(parseISO(weekStartISO), 6), 'yyyy-MM-dd');
  const endAnchor = new Date(`${endISO}T12:00:00.000Z`);
  const startLabel = formatInTimeZone(startAnchor, userTimezone, 'EEE LLL d');
  const endLabel = formatInTimeZone(endAnchor, userTimezone, 'EEE LLL d');
  return `${startLabel} – ${endLabel}`;
}

/** 7 ISO calendar dates Monday..Sunday from a weekStart Monday. */
export function daysInWeek(weekStartISO: string): string[] {
  const start = parseISO(weekStartISO);
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
}

/**
 * The week's number within its quarter, 1-indexed. Used in the weekly
 * planning system prompt ("Week N of Quarter Q").
 */
export function weekNumberWithinQuarter(weekStartISO: string, quarter: Quarter): number {
  const qStart = parseISO(quarter.startDate);
  const wStart = parseISO(weekStartISO);
  const dayMs = 86_400_000;
  const days = Math.round((wStart.getTime() - qStart.getTime()) / dayMs);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** Validate that an arbitrary URL segment is a Monday in the user's TZ. */
export function isMondayInTz(weekStartISO: string, userTimezone: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartISO)) return false;
  const anchor = new Date(`${weekStartISO}T12:00:00.000Z`);
  const iso = formatInTimeZone(anchor, userTimezone, 'i');
  return iso === '1';
}

/** Convert a weekStart ISO date to UTC Date bounds for ranged DB queries. */
export function weekUtcBounds(
  weekStartISO: string,
  userTimezone: string,
): { startUtc: Date; endUtc: Date; endISO: string } {
  const endISO = format(addDays(parseISO(weekStartISO), 6), 'yyyy-MM-dd');
  const startUtc = fromZonedTime(`${weekStartISO}T00:00:00`, userTimezone);
  const endUtc = fromZonedTime(`${endISO}T23:59:59.999`, userTimezone);
  return { startUtc, endUtc, endISO };
}
