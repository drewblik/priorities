import { formatInTimeZone } from 'date-fns-tz';

/**
 * Pure formatter for the "Email me this plan" sticky-note text.
 *
 * Input: any chronological list of scheduled items (time-blocked tasks,
 * the user's events, synced calendar meetings — merged by the caller).
 * Output: a single block of plain text, one line per item plus filler
 * lines for any open gap between the first and last scheduled item.
 *
 * Format mirrors the owner's spec literally:
 *   6-7am - wake up + walk
 *   7-9am - deep focus on X task
 *   9-10am - open
 *   10-11am - sprint planning
 *   12-1pm - lunch
 *   2:30-3pm - open
 *   3-4pm - call with Sam
 */

/** Open gaps shorter than this are ignored (no noisy 5-min "open" lines
 *  between back-to-back meetings). */
const GAP_MIN_MINUTES = 15;

export type ScheduledItem = {
  startUtc: Date;
  endUtc: Date;
  title: string;
};

type Stamp = { hours: number; minutes: number; period: 'am' | 'pm' };

function formatStamp(d: Date, tz: string): Stamp {
  const hour24 = Number.parseInt(formatInTimeZone(d, tz, 'H'), 10);
  const minutes = Number.parseInt(formatInTimeZone(d, tz, 'm'), 10);
  const period: 'am' | 'pm' = hour24 < 12 ? 'am' : 'pm';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hours: h12, minutes, period };
}

function stampText(s: Stamp): string {
  return s.minutes === 0
    ? `${s.hours}`
    : `${s.hours}:${String(s.minutes).padStart(2, '0')}`;
}

function formatRange(startUtc: Date, endUtc: Date, tz: string): string {
  const s = formatStamp(startUtc, tz);
  const e = formatStamp(endUtc, tz);
  // Same half-of-day → suffix the period once at the end (6-7am).
  // Crossing noon → suffix each side (11am-1pm).
  if (s.period === e.period) {
    return `${stampText(s)}-${stampText(e)}${e.period}`;
  }
  return `${stampText(s)}${s.period}-${stampText(e)}${e.period}`;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

export function buildDayPlanText(items: ScheduledItem[], tz: string): string {
  if (items.length === 0) return 'Nothing scheduled.';

  const sorted = [...items].sort(
    (a, b) => a.startUtc.getTime() - b.startUtc.getTime(),
  );

  const lines: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    lines.push(
      `${formatRange(cur.startUtc, cur.endUtc, tz)} - ${cleanTitle(cur.title)}`,
    );

    // Fill any meaningful gap between this item's end and the next item's
    // start. Overlapping items (cur.endUtc > next.startUtc) yield a
    // negative gap which falls below the threshold and is skipped — the
    // overlap simply renders as two consecutive lines.
    const next = sorted[i + 1];
    if (!next) continue;
    const gapMs = next.startUtc.getTime() - cur.endUtc.getTime();
    if (gapMs >= GAP_MIN_MINUTES * 60_000) {
      lines.push(`${formatRange(cur.endUtc, next.startUtc, tz)} - open`);
    }
  }

  return lines.join('\n');
}
