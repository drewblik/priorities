import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  getDate,
  getDay,
  parseISO,
} from 'date-fns';
import type { Recurrence, Task, Event } from '@/db/schema';

// Day-of-week alignment with our Recurrence weekday strings.
// JS Date.getDay() returns 0=Sun..6=Sat; date-fns getDay matches.
const WEEKDAY_BY_INDEX: Record<number, 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA'> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
};

/**
 * True iff a recurring template's pattern includes the given calendar date.
 *
 * @param recurrence  the template's recurrence jsonb
 * @param startISO    the template's target_date / start_time as YYYY-MM-DD
 *                    (the FIRST occurrence — pattern anchors here)
 * @param queryISO    the calendar date to test, YYYY-MM-DD
 */
export function recurrenceIncludesDate(
  recurrence: Recurrence,
  startISO: string,
  queryISO: string,
): boolean {
  const start = parseISO(startISO);
  const query = parseISO(queryISO);

  // Strict ordering — pattern starts at startDate, never fires earlier.
  if (differenceInCalendarDays(query, start) < 0) return false;

  if (recurrence.until) {
    const until = parseISO(recurrence.until);
    if (differenceInCalendarDays(query, until) > 0) return false;
  }

  if (recurrence.type === 'daily') {
    const days = differenceInCalendarDays(query, start);
    return days % recurrence.interval === 0;
  }

  if (recurrence.type === 'weekly') {
    const queryWeekday = WEEKDAY_BY_INDEX[getDay(query)];
    const allowedDays =
      recurrence.byday && recurrence.byday.length > 0
        ? recurrence.byday
        : [WEEKDAY_BY_INDEX[getDay(start)]];
    if (!allowedDays.includes(queryWeekday)) return false;
    // Use Monday-anchored weeks so byday=[MO,WE,FR] in interval=2 weeks
    // resolves consistently across week boundaries.
    const weeks = differenceInCalendarWeeks(query, start, { weekStartsOn: 1 });
    return weeks % recurrence.interval === 0;
  }

  if (recurrence.type === 'monthly') {
    const targetDay = recurrence.bymonthday ?? getDate(start);
    if (getDate(query) !== targetDay) return false;
    const months = differenceInCalendarMonths(query, start);
    return months % recurrence.interval === 0;
  }

  return false;
}

// =============================================================================
// Virtual instance materialization
// =============================================================================

export type DisplayedTask = Task & { kind: 'real' | 'virtual'; templateId?: string };
export type DisplayedEvent = Event & { kind: 'real' | 'virtual'; templateId?: string };

/**
 * Build a synthetic ID for a virtual instance of a template on a date.
 * Format: `virt_<template_id>_<YYYY-MM-DD>` (TDD §973).
 */
export function virtualInstanceId(templateId: string, dateISO: string): string {
  return `virt_${templateId}_${dateISO}`;
}

/** True iff `id` looks like a virtual instance id; safe to call on real ids too. */
export function isVirtualInstanceId(id: string): boolean {
  return id.startsWith('virt_');
}

/** Parse a virtual id back into its parts; returns null if not a virtual id. */
export function parseVirtualInstanceId(
  id: string,
): { templateId: string; dateISO: string } | null {
  if (!isVirtualInstanceId(id)) return null;
  // virt_<templateId>_<YYYY-MM-DD>. Date is fixed-width 10 chars at the end.
  if (id.length < 'virt__YYYY-MM-DD'.length) return null;
  const dateISO = id.slice(-10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  // Strip "virt_" prefix and "_<date>" suffix.
  const templateId = id.slice('virt_'.length, id.length - 11);
  if (templateId.length === 0) return null;
  return { templateId, dateISO };
}

/**
 * Build a virtual task instance: a clone of the template with target_date
 * pinned to the requested date and a synthetic id. Time block (if any on
 * the template) is shifted by the same calendar-day delta. Status defaults
 * to 'open' for unmaterialized instances.
 */
export function materializeVirtualTask(template: Task, dateISO: string): DisplayedTask {
  const date = parseISO(dateISO);
  const tStart = template.timeBlockStart;
  const tEnd = template.timeBlockEnd;

  let timeBlockStart: Date | null = null;
  let timeBlockEnd: Date | null = null;
  if (tStart && tEnd) {
    // NOTE: simple addDays on UTC timestamps. For DST transitions in user's
    // local TZ, the wall-clock time of the instance may shift by 1 hour vs
    // the template — acceptable v1 limitation (TDD §1017 area). M9+ Daily
    // View renders in user's TZ and surfaces this if it ever bites.
    const dayDelta = template.targetDate
      ? differenceInCalendarDays(date, parseISO(template.targetDate))
      : 0;
    timeBlockStart = addDays(tStart, dayDelta);
    timeBlockEnd = addDays(tEnd, dayDelta);
  }

  return {
    ...template,
    id: virtualInstanceId(template.id, dateISO),
    targetDate: dateISO,
    timeBlockStart,
    timeBlockEnd,
    status: 'open',
    completedAt: null,
    instanceOfTaskId: template.id,
    recurrence: null,
    kind: 'virtual',
    templateId: template.id,
  };
}

/**
 * Build a virtual event instance. start_time / end_time shift by the
 * calendar-day delta from the template's first occurrence to the requested
 * date. Same DST caveat as materializeVirtualTask.
 */
export function materializeVirtualEvent(template: Event, dateISO: string): DisplayedEvent {
  const queryDate = parseISO(dateISO);
  const templateStartDate = parseISO(
    `${template.startTime.toISOString().slice(0, 10)}`,
  );
  const dayDelta = differenceInCalendarDays(queryDate, templateStartDate);

  return {
    ...template,
    id: virtualInstanceId(template.id, dateISO),
    startTime: addDays(template.startTime, dayDelta),
    endTime: addDays(template.endTime, dayDelta),
    completionStatus: null,
    completedAt: null,
    instanceOfEventId: template.id,
    recurrence: null,
    kind: 'virtual',
    templateId: template.id,
  };
}
