import { NextResponse } from 'next/server';
import { requireUser } from '@/auth';
import { getCalendarFeedEventsForRange } from '@/lib/calendar-feeds';
import { dayLabel, isIsoDate } from '@/lib/daily-utils';
import {
  buildDayPlanText,
  type ScheduledItem,
} from '@/lib/day-plan-email-format';
import { sendDayPlanEmail } from '@/lib/email';
import { getEventsForDateRange } from '@/lib/events';
import { getTasksForDate } from '@/lib/tasks';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ dateISO: string }> },
) {
  const session = await requireUser();
  const { dateISO } = await ctx.params;
  if (!isIsoDate(dateISO)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }

  const tz = session.user.timezone;
  const [taskRows, eventRows, feedRows] = await Promise.all([
    getTasksForDate(session.user.id, dateISO),
    getEventsForDateRange(session.user.id, dateISO, dateISO, tz),
    getCalendarFeedEventsForRange(session.user.id, dateISO, dateISO, tz),
  ]);

  const items: ScheduledItem[] = [
    ...taskRows
      .filter((t) => t.timeBlockStart && t.timeBlockEnd)
      .map((t) => ({
        startUtc: t.timeBlockStart!,
        endUtc: t.timeBlockEnd!,
        title: t.title,
      })),
    ...eventRows.map((e) => ({
      startUtc: e.startTime,
      endUtc: e.endTime,
      title: e.title,
    })),
    ...feedRows
      .filter((f) => !f.allDay)
      .map((f) => ({
        startUtc: f.startTime,
        endUtc: f.endTime,
        title: f.title,
      })),
  ];

  const text = buildDayPlanText(items, tz);
  const label = dayLabel(dateISO, tz);

  try {
    await sendDayPlanEmail(session.user.email, label, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed';
    console.error('day-plan email failed:', message);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
