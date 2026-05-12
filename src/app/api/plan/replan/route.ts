import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/auth';
import {
  deleteSessionsForHorizon,
  reopenSession,
} from '@/lib/replan';

export const runtime = 'nodejs';

const SESSION_TYPES = ['quarter', 'weekly', 'daily'] as const;

const BodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('all'),
    sessionType: z.enum(SESSION_TYPES),
    contextRef: z.string().min(1).max(100),
  }),
  z.object({
    mode: z.literal('one'),
    sessionType: z.enum(SESSION_TYPES),
    contextRef: z.string().min(1).max(100),
    priorityId: z.string().min(1).max(100),
  }),
]);

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const userId = session.user.id;

  if (body.mode === 'all') {
    const removed = await deleteSessionsForHorizon(
      userId,
      body.sessionType,
      body.contextRef,
    );
    return NextResponse.json({ ok: true, removed });
  }

  // mode === 'one'
  const reopened = await reopenSession(
    userId,
    body.sessionType,
    body.contextRef,
    body.priorityId,
  );
  if (!reopened) {
    return NextResponse.json(
      { error: 'no_closed_session', message: 'No closed session to reopen for that Priority.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, sessionId: reopened.id });
}
