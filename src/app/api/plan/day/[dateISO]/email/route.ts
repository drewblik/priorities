import { NextResponse } from 'next/server';
import { requireUser } from '@/auth';
import {
  getCalendarFeedEventsForRange,
  getFeedsForUser,
} from '@/lib/calendar-feeds';
import { dayLabel, isIsoDate } from '@/lib/daily-utils';
import {
  buildDayPlanText,
  type ScheduledItem,
} from '@/lib/day-plan-email-format';
import { sendDayPlanEmail } from '@/lib/email';
import { getEventsForDateRange } from '@/lib/events';
import { getTasksForDate } from '@/lib/tasks';

export const runtime = 'nodejs';

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ dateISO: string }> },
) {
  const session = await requireUser();
  const { dateISO } = await ctx.params;
  if (!isIsoDate(dateISO)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }

  // Optional destination override. If absent → account email. If present →
  // must match the user's account email or one of their feed
  // `calendar_email` values (case-insensitive). The client picker is
  // convenience; this re-check is the real trust boundary.
  const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
  const requestedTo =
    body && typeof body.to === 'string' && body.to.trim().length > 0
      ? body.to.trim()
      : null;

  let recipient = session.user.email;
  if (requestedTo !== null) {
    const feeds = await getFeedsForUser(session.user.id);
    const allowed = new Set<string>([normalize(session.user.email)]);
    for (const f of feeds) {
      if (f.calendarEmail) allowed.add(normalize(f.calendarEmail));
    }
    if (!allowed.has(normalize(requestedTo))) {
      return NextResponse.json(
        { error: 'invalid_destination' },
        { status: 400 },
      );
    }
    recipient = requestedTo;
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
    await sendDayPlanEmail(recipient, label, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed';
    console.error('day-plan email failed:', message);
    // Surface the actual error to the UI (single-user app; the only
    // consumer is the owner). Without this the user sees a generic
    // "Send failed" and can't tell e.g. a Resend free-tier recipient
    // restriction from a transient network blip.
    return NextResponse.json(
      { error: 'send_failed', detail: message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
