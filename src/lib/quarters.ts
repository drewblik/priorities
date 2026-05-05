import { and, eq, isNull } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/db/client';
import { quarters, type Quarter } from '@/db/schema';
import { newId } from '@/lib/id';

// =============================================================================
// Pure helpers (no DB)
// =============================================================================

export function currentDateInTz(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

/**
 * Calendar-quarter bounds containing `yyyymmdd` (interpreted as a plain date).
 * Q1 = Jan 1–Mar 31, Q2 = Apr 1–Jun 30, Q3 = Jul 1–Sep 30, Q4 = Oct 1–Dec 31.
 */
export function calendarQuarterBounds(yyyymmdd: string): {
  label: string;
  startISO: string;
  endISO: string;
} {
  const [yearStr, monthStr] = yyyymmdd.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10); // 1–12
  const qIndex = Math.floor((month - 1) / 3); // 0..3
  const startMonth = qIndex * 3 + 1; // 1, 4, 7, 10
  const endMonth = startMonth + 2; // 3, 6, 9, 12
  const endDay = [3, 5, 8, 10].includes(endMonth - 1) ? 30 : 31; // Jun, Sep have 30; others 31
  // Mar (3), Dec (12), May (5), Jul (7), Aug (8), Oct (10) all have 31. The
  // quarter end months are 3, 6, 9, 12: Jun (6) and Sep (9) have 30, others 31.
  const actualEndDay = endMonth === 6 || endMonth === 9 ? 30 : 31;
  return {
    label: `Q${qIndex + 1} ${year}`,
    startISO: `${year}-${pad2(startMonth)}-01`,
    endISO: `${year}-${pad2(endMonth)}-${pad2(actualEndDay)}`,
  };
}

/**
 * Whole weeks (rounded up) covered by an inclusive ISO date range.
 * 13 for a full calendar quarter; 1–13 for partial quarters.
 */
export function weeksInQuarter(startISO: string, endISO: string): number {
  const days = daysBetweenInclusive(startISO, endISO);
  return Math.ceil(days / 7);
}

/**
 * Current week number within a quarter (1-indexed), bounded by totalWeeks.
 */
export function weekNumber(todayISO: string, startISO: string, totalWeeks: number): number {
  const days = daysBetweenInclusive(startISO, todayISO);
  if (days <= 0) return 1;
  return Math.min(totalWeeks, Math.floor((days - 1) / 7) + 1);
}

function daysBetweenInclusive(fromISO: string, toISO: string): number {
  const from = isoToUtcDate(fromISO);
  const to = isoToUtcDate(toISO);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function isoToUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function addDaysISO(iso: string, days: number): string {
  const d = isoToUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// DB-backed helpers
// =============================================================================

export async function getQuarterById(
  userId: string,
  id: string,
): Promise<Quarter | null> {
  const rows = await db
    .select()
    .from(quarters)
    .where(
      and(
        eq(quarters.id, id),
        eq(quarters.userId, userId),
        isNull(quarters.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveQuarter(userId: string): Promise<Quarter | null> {
  const rows = await db
    .select()
    .from(quarters)
    .where(
      and(
        eq(quarters.userId, userId),
        eq(quarters.status, 'active'),
        isNull(quarters.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function closeQuarter(quarterId: string): Promise<void> {
  await db
    .update(quarters)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(quarters.id, quarterId));
}

async function createPartialFirstQuarter(userId: string, todayISO: string): Promise<Quarter> {
  const bounds = calendarQuarterBounds(todayISO);
  const isPartial = todayISO !== bounds.startISO;
  const [row] = await db
    .insert(quarters)
    .values({
      id: newId('qtr'),
      userId,
      quarterLabel: bounds.label,
      startDate: todayISO,
      endDate: bounds.endISO,
      status: 'active',
      isPartial,
    })
    .returning();
  if (!row) throw new Error('quarter_insert_failed');
  return row;
}

async function createNextCalendarQuarter(userId: string, todayISO: string): Promise<Quarter> {
  // Whatever calendar quarter today falls in becomes the new active one.
  const bounds = calendarQuarterBounds(todayISO);
  const [row] = await db
    .insert(quarters)
    .values({
      id: newId('qtr'),
      userId,
      quarterLabel: bounds.label,
      startDate: bounds.startISO,
      endDate: bounds.endISO,
      status: 'active',
      isPartial: false,
    })
    .returning();
  if (!row) throw new Error('quarter_insert_failed');
  return row;
}

/**
 * Returns the user's currently-active quarter, creating one (or rolling over
 * past the previous end_date) as needed. Idempotent — safe to call on every
 * authed page render.
 */
export async function ensureCurrentQuarter(
  userId: string,
  userTimezone: string,
): Promise<Quarter> {
  const todayISO = currentDateInTz(userTimezone);
  const active = await getActiveQuarter(userId);

  if (!active) {
    return createPartialFirstQuarter(userId, todayISO);
  }

  if (todayISO > active.endDate) {
    // Sequential close-then-insert (the unique partial index requires the
    // close to land first; Neon HTTP driver doesn't allow result-branching
    // inside a single transaction).
    await closeQuarter(active.id);
    return createNextCalendarQuarter(userId, todayISO);
  }

  return active;
}
