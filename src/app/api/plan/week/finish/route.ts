import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/auth';
import {
  closeSession,
  getClosedSessions,
  getOrCreateSession,
  getSessionByIdForUser,
} from '@/lib/chat-sessions';
import { getWeeklyPlanningQueue } from '@/lib/priorities';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { sessionId?: string } | null;
  const sessionId = body?.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId_required' }, { status: 400 });
  }

  const chat = await getSessionByIdForUser(session.user.id, sessionId);
  if (!chat || chat.sessionType !== 'weekly' || !chat.contextRef) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  }

  await closeSession(session.user.id, sessionId);

  const queue = await getWeeklyPlanningQueue(session.user.id);
  const closed = await getClosedSessions(session.user.id, 'weekly', chat.contextRef);
  const closedPriorityIds = new Set(closed.map((s) => s.priorityId).filter((v): v is string => !!v));

  const next = queue.find((p) => !closedPriorityIds.has(p.id));
  if (!next) {
    return NextResponse.json({ done: true, currentPriorityId: null, sessionId: null });
  }

  const newSession = await getOrCreateSession({
    userId: session.user.id,
    sessionType: 'weekly',
    contextRef: chat.contextRef,
    priorityId: next.id,
  });

  return NextResponse.json({
    done: false,
    currentPriorityId: next.id,
    sessionId: newSession.id,
  });
}
