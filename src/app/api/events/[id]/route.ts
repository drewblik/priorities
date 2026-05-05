import { NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';
import { getCurrentSession } from '@/auth';
import { getEventById, softDeleteEvent, updateEvent } from '@/lib/events';
import {
  UpdateEventSchema,
  formDataToEventPayload,
  isFormPost,
} from '@/lib/priorities-validation';

export const runtime = 'nodejs';

function origin(req: Request): string {
  return new URL(req.url).origin;
}

type Ctx = { params: Promise<{ id: string }> };

async function handle(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  const formPost = isFormPost(req);
  const { id } = await ctx.params;

  if (!session) {
    if (formPost) return NextResponse.redirect(`${origin(req)}/signin`, 303);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let action: string | null = null;
  let redirectBack: string | null = null;
  let formPayload: Record<string, unknown> = {};
  if (formPost) {
    const form = await req.formData();
    const a = form.get('_action');
    if (typeof a === 'string') action = a;
    const r = form.get('_redirect');
    if (typeof r === 'string' && r.startsWith('/')) redirectBack = r;
    formPayload = formDataToEventPayload(form);
  }

  if (req.method === 'DELETE' || action === 'delete') {
    const existing = await getEventById(session.user.id, id);
    const fallbackBack = existing
      ? `/priorities/${existing.ownerPriorityId}`
      : '/priorities';

    const ok = await softDeleteEvent(session.user.id, id);
    if (!ok) {
      if (formPost) {
        const back = redirectBack ?? fallbackBack;
        const sep = back.includes('?') ? '&' : '?';
        return NextResponse.redirect(`${origin(req)}${back}${sep}error=not_found`, 303);
      }
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (formPost) {
      const back = redirectBack ?? fallbackBack;
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}event_deleted=1`, 303);
    }
    return NextResponse.json({ deleted: true });
  }

  const payload = formPost ? formPayload : await req.json().catch(() => null);
  const parsed = UpdateEventSchema.safeParse(payload);
  if (!parsed.success) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=validation_failed`, 303);
    }
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tz = session.user.timezone;
  const patch: Parameters<typeof updateEvent>[2] = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.startTime !== undefined) {
    patch.startTime = fromZonedTime(parsed.data.startTime, tz);
  }
  if (parsed.data.endTime !== undefined) {
    patch.endTime = fromZonedTime(parsed.data.endTime, tz);
  }
  if (parsed.data.recurrence !== undefined) patch.recurrence = parsed.data.recurrence;
  if (parsed.data.completionStatus !== undefined) {
    patch.completionStatus = parsed.data.completionStatus;
  }

  if (
    patch.startTime instanceof Date &&
    patch.endTime instanceof Date &&
    patch.endTime <= patch.startTime
  ) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=validation_failed`, 303);
    }
    return NextResponse.json({ error: 'end_must_follow_start' }, { status: 400 });
  }

  const updated = await updateEvent(session.user.id, id, patch);
  if (!updated) {
    if (formPost) {
      const back = redirectBack ?? '/priorities';
      const sep = back.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${origin(req)}${back}${sep}error=not_found`, 303);
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (formPost) {
    const back = redirectBack ?? `/priorities/${updated.ownerPriorityId}`;
    const sep = back.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${origin(req)}${back}${sep}event_saved=1`, 303);
  }
  return NextResponse.json(updated);
}

export const PATCH = handle;
export const POST = handle;
export const DELETE = handle;
