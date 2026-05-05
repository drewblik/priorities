import { NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';
import { getCurrentSession } from '@/auth';
import { createTask } from '@/lib/tasks';
import {
  CreateTaskSchema,
  formDataToTaskPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

function readRedirect(form: FormData): string | null {
  const r = form.get('_redirect');
  return typeof r === 'string' && r.startsWith('/') ? r : null;
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
    redirectBack = readRedirect(form);
    payload = formDataToTaskPayload(form);
  } else {
    payload = await req.json().catch(() => null);
  }

  const parsed = CreateTaskSchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(
        `${origin(req)}${back}${sep}error=validation_failed`,
        303,
      );
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tz = session.user.timezone;
  const tbStart = parsed.data.timeBlockStart
    ? fromZonedTime(parsed.data.timeBlockStart, tz)
    : null;
  const tbEnd = parsed.data.timeBlockEnd
    ? fromZonedTime(parsed.data.timeBlockEnd, tz)
    : null;

  if (tbStart && tbEnd && tbEnd <= tbStart) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=validation_failed`, 303);
    }
    return NextResponse.json({ error: 'time_block_end_must_follow_start' }, { status: 400 });
  }

  let created;
  try {
    created = await createTask(session.user.id, {
      ownerPriorityId: parsed.data.ownerPriorityId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      targetDate: parsed.data.targetDate ?? null,
      timeBlockStart: tbStart,
      timeBlockEnd: tbEnd,
      recurrence: parsed.data.recurrence ?? null,
    });
  } catch (err) {
    console.error('createTask failed:', err instanceof Error ? err.message : err);
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=save_failed`, 303);
    }
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (!created) {
    // verifyPriorityOwnership returned false.
    if (formPost) return NextResponse.redirect(`${origin(req)}/priorities?error=not_found`, 303);
    return NextResponse.json({ error: 'priority_not_found' }, { status: 404 });
  }

  if (formPost) {
    const back = redirectBack ?? `/priorities/${parsed.data.ownerPriorityId}`;
    const sep = back.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${origin(req)}${back}${sep}task_saved=1`, 303);
  }
  return NextResponse.json(created, { status: 201 });
}
