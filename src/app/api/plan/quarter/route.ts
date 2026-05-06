import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import { getOrCreateSession, getClosedSessions } from '@/lib/chat-sessions';
import { ensureCurrentQuarter, getQuarterById, weeksInQuarter } from '@/lib/quarters';
import { getQuarterlyPlanningQueue } from '@/lib/priorities';
import { getQuarterWeekFocusForQuarter } from '@/lib/quarter-week-focus';

export const runtime = 'nodejs';

/**
 * Start or resume a quarter-planning session for the user. Computes the
 * queue (quarterly-cadence priorities by position), determines which are
 * already done (have a closed chat_session row for this quarter), and
 * returns the current priority + an open session for it.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { quarterId?: string } | null;
  let quarterId = body?.quarterId;

  // If no id given, fall back to the active quarter (matches /plan/quarter
  // page redirect behavior).
  let quarter = quarterId
    ? await getQuarterById(session.user.id, quarterId)
    : await ensureCurrentQuarter(session.user.id, session.user.timezone);
  if (!quarter) {
    return NextResponse.json({ error: 'quarter_not_found' }, { status: 404 });
  }
  quarterId = quarter.id;

  const queue = await getQuarterlyPlanningQueue(session.user.id);
  const closed = await getClosedSessions(session.user.id, 'quarter', quarterId);
  const closedPriorityIds = new Set(closed.map((s) => s.priorityId).filter((v): v is string => !!v));

  // Find first un-completed priority in the queue.
  const current = queue.find((p) => !closedPriorityIds.has(p.id));
  if (!current) {
    // Queue done — no current session needed.
    return NextResponse.json({
      quarterId,
      queue: queue.map((p) => ({ id: p.id, name: p.name, color: p.icon.color })),
      doneIds: Array.from(closedPriorityIds),
      currentPriorityId: null,
      sessionId: null,
      totalWeeks: weeksInQuarter(quarter.startDate, quarter.endDate),
      quarterWeekFocus: await getQuarterWeekFocusForQuarter(session.user.id, quarterId),
    });
  }

  const chatSession = await getOrCreateSession({
    userId: session.user.id,
    sessionType: 'quarter',
    contextRef: quarterId,
    priorityId: current.id,
  });

  return NextResponse.json({
    quarterId,
    queue: queue.map((p) => ({ id: p.id, name: p.name, color: p.icon.color })),
    doneIds: Array.from(closedPriorityIds),
    currentPriorityId: current.id,
    sessionId: chatSession.id,
    totalWeeks: weeksInQuarter(quarter.startDate, quarter.endDate),
    quarterWeekFocus: await getQuarterWeekFocusForQuarter(session.user.id, quarterId),
  });
}
