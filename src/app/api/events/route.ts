import { NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';
import type { ZodIssue } from 'zod';
import { getCurrentSession } from '@/auth';
import { createEvent } from '@/lib/events';
import {
  CreateEventSchema,
  formDataToEventPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

function firstIssueMsg(issues: ZodIssue[]): string {
  const first = issues[0];
  if (!first) return 'Invalid input.';
  const path = first.path.length > 0 ? first.path.join('.') : '';
  return path ? `${path}: ${first.message}` : first.message;
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  let redirectBack: string | null = null;
  if (formPost) {
    const form = await req.formData();
    const r = form.get('_redirect');
    if (typeof r === 'string' && r.startsWith('/')) redirectBack = r;
    payload = formDataToEventPayload(form);
  } else {
    payload = await req.json().catch(() => null);
  }

  const parsed = CreateEventSchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      const issue = encodeURIComponent(firstIssueMsg(parsed.error.issues));
      return NextResponse.redirect(
        `${origin(req)}${back}${sep}error=validation_failed&validation_issue=${issue}`,
        303,
      );
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tz = session.user.timezone;
  const startUtc = fromZonedTime(parsed.data.startTime, tz);
  const endUtc = fromZonedTime(parsed.data.endTime, tz);

  if (endUtc <= startUtc) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      const issue = encodeURIComponent('Event end time must be after start time');
      return NextResponse.redirect(
        `${origin(req)}${back}${sep}error=validation_failed&validation_issue=${issue}`,
        303,
      );
    }
    return NextResponse.json({ error: 'end_must_follow_start' }, { status: 400 });
  }

  let created;
  try {
    created = await createEvent(session.user.id, {
      ownerPriorityId: parsed.data.ownerPriorityId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      startTime: startUtc,
      endTime: endUtc,
      recurrence: parsed.data.recurrence ?? null,
    });
  } catch (err) {
    console.error('createEvent failed:', err instanceof Error ? err.message : err);
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=save_failed`, 303);
    }
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (!created) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/priorities?error=not_found`, 303);
    return NextResponse.json({ error: 'priority_not_found' }, { status: 404 });
  }

  if (formPost) {
    const back = redirectBack ?? `/priorities/${parsed.data.ownerPriorityId}`;
    const sep = back.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${origin(req)}${back}${sep}event_saved=1`, 303);
  }
  return NextResponse.json(created, { status: 201 });
}
